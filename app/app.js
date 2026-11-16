import { fetchIncidents, ack } from './api.js';

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const errorBox = document.querySelector('[data-testid="error"]');
const panelHost = document.querySelector('#panel-host');

/** Everything this board has seen tonight, by incident id (SCHED-4511). */
const seen = new Map();
/** One <li> per incident id: a row is built once and then only updated, so no row is ever removed. */
const rowEls = new Map();
/** id -> ackedAt, so an ack survives the next refresh (SCHED-4511). */
const acked = new Map();
/** ids with an ack in flight. */
const pending = new Set();
/** The incident whose panel is open, by id: the panel, not the row, owns the ack (product's decision). */
let panelId = null;

let firstLoadDone = false;

const timeFormat = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Local time for the viewer; dd/mm for EU locales, because the formatter follows their locale (SCHED-4514). */
function localTime(iso) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return timeFormat.format(at);
}

/** Newest first, by when the incident opened (R1). */
function ordered() {
  return [...seen.values()].sort((a, b) => (Date.parse(b.openedAt) || 0) - (Date.parse(a.openedAt) || 0));
}

function buildRow(incident) {
  const li = document.createElement('li');
  li.dataset.testid = 'incident-row';
  li.dataset.id = incident.id;
  li.setAttribute('role', 'button');
  li.tabIndex = 0;
  li.innerHTML =
    '<span class="id"></span><span class="sev"></span><span class="what"></span>' +
    '<time></time><span class="mark"></span>';
  return li;
}

function fillRow(li, incident) {
  li.className = `row ${incident.severity}`;
  li.querySelector('.id').textContent = incident.id;
  li.querySelector('.sev').textContent = incident.severity;
  li.querySelector('.what').textContent = `${incident.service} · ${incident.region} · ${incident.summary}`;
  const time = li.querySelector('time');
  time.setAttribute('datetime', incident.openedAt);
  time.setAttribute('title', `${incident.openedAt} UTC`);
  time.textContent = localTime(incident.openedAt);
  const mark = li.querySelector('.mark');
  if (acked.has(incident.id)) {
    mark.textContent = 'acked';
    mark.title = `acked ${acked.get(incident.id)}`;
    mark.className = 'mark acked';
    mark.dataset.testid = 'acked';
  } else {
    mark.textContent = 'open';
    mark.removeAttribute('title');
    mark.className = 'mark open-hint';
    delete mark.dataset.testid;
  }
}

/** Put a new row where it belongs without touching the rows already on screen. */
function placeRow(li, incident) {
  const newer = Date.parse(incident.openedAt) || 0;
  const before = [...list.children].find((other) => (Date.parse(seen.get(other.dataset.id)?.openedAt) || 0) < newer);
  if (before) list.insertBefore(li, before);
  else list.appendChild(li);
}

function renderList() {
  const incidents = ordered();
  empty.hidden = incidents.length !== 0;

  for (const incident of incidents) {
    let li = rowEls.get(incident.id);
    if (!li) {
      li = buildRow(incident);
      rowEls.set(incident.id, li);
      fillRow(li, incident);
      placeRow(li, incident);
      continue;
    }
    fillRow(li, incident);
  }
}

function ackMark(id) {
  return `<span class="acked" data-testid="acked" title="acked ${acked.get(id)}">acked</span>`;
}

function renderPanel() {
  const incident = panelId ? seen.get(panelId) : null;
  if (!incident) {
    if (panelHost.firstElementChild) panelHost.replaceChildren();
    return;
  }
  const id = incident.id;
  const markup = `<section data-testid="incident-panel" data-id="${incident.id}" class="panel ${incident.severity}">
      <div class="panel-head">
        <h2><span class="id">${incident.id}</span> <span class="sev">${incident.severity}</span></h2>
        <button type="button" class="close" data-testid="panel-close" aria-label="close panel">close</button>
      </div>
      <p class="what">${incident.service} · ${incident.region} · ${incident.summary}</p>
      <p class="when">opened <time datetime="${incident.openedAt}" title="${incident.openedAt} UTC">${localTime(incident.openedAt)}</time></p>
      <div class="panel-actions">
        ${acked.has(id) ? ackMark(id) : `<button type="button" data-testid="panel-ack" data-id="${id}"${pending.has(id) ? ' disabled' : ''}>Ack</button>`}
      </div>
    </section>`;
  if (panelHost.firstElementChild) panelHost.firstElementChild.outerHTML = markup;
  else panelHost.innerHTML = markup;
}

function render() {
  renderList();
  renderPanel();
}

function showError(error) {
  errorBox.textContent = `could not read the incidents: ${error.message}`;
  errorBox.hidden = false;
}

function hideError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

/** One read of what is current, merged into what we already have (SCHED-4513). */
async function refresh() {
  try {
    const page = await fetchIncidents();
    for (const incident of page.incidents ?? []) seen.set(incident.id, incident);
    hideError();
  } catch (error) {
    showError(error);
  } finally {
    if (!firstLoadDone) {
      firstLoadDone = true;
      loader.remove();
    }
    render();
  }
}

/** A row opens its incident; the ack happens in the panel, for the incident the panel names. */
list.addEventListener('click', (event) => {
  const row = event.target.closest('[data-testid="incident-row"]');
  if (!row) return;
  panelId = row.dataset.id;
  renderPanel();
});

list.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const row = event.target.closest('[data-testid="incident-row"]');
  if (!row) return;
  event.preventDefault();
  panelId = row.dataset.id;
  renderPanel();
});

panelHost.addEventListener('click', async (event) => {
  if (event.target.closest('[data-testid="panel-close"]')) {
    panelId = null;
    renderPanel();
    return;
  }
  const button = event.target.closest('[data-testid="panel-ack"]');
  if (!button) return;
  const id = button.dataset.id;
  if (!id || pending.has(id)) return;

  pending.add(id);
  button.disabled = true;
  try {
    const receipt = await ack(id);
    acked.set(id, receipt.ackedAt);
    render();
  } catch (error) {
    showError(error);
    renderPanel();
  } finally {
    pending.delete(id);
  }
});

window.__board = { incidents: seen, acks: () => import('./api.js').then((m) => m.acks), panelId: () => panelId };

await refresh();
setInterval(refresh, 2000);
