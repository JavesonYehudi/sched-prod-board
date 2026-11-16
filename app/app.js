import { fetchIncidents, ack } from './api.js';

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const errorBox = document.querySelector('[data-testid="error"]');
const panelHost = document.querySelector('#panel-host');

/** Everything this board has seen tonight, by incident id (SCHED-4511). */
const seen = new Map();
/** id -> ackedAt, so an ack survives the next refresh (SCHED-4511). */
const acked = new Map();
/** ids with an ack in flight. */
const pending = new Set();
/** The incident whose panel is open, by id: the panel, not the row, owns the ack (product's decision). */
let panelId = null;

let firstLoadDone = false;
let latestCursor = null;

const LOCAL = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
const timeFormat = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit', ...LOCAL });

/** Local time for the viewer; dd/mm for EU locales, because the formatter follows their locale (SCHED-4514). */
function localTime(iso) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return timeFormat.format(at);
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Newest first, by when the incident opened (R1). */
function ordered() {
  return [...seen.values()].sort((a, b) => {
    const ta = Date.parse(a.openedAt) || 0;
    const tb = Date.parse(b.openedAt) || 0;
    return tb - ta;
  });
}

function ackMark(id) {
  return `<span data-testid="acked" class="acked" title="acked ${escapeHtml(acked.get(id))}">acked</span>`;
}

function renderList() {
  const incidents = ordered();
  empty.hidden = incidents.length !== 0;

  list.innerHTML = incidents
    .map((i) => `<li data-testid="incident-row" data-id="${escapeHtml(i.id)}" class="row ${escapeHtml(i.severity)}" role="button" tabindex="0" aria-label="open ${escapeHtml(i.id)}">
        <span class="id">${escapeHtml(i.id)}</span>
        <span class="sev">${escapeHtml(i.severity)}</span>
        <span class="what">${escapeHtml(i.service)} · ${escapeHtml(i.region)} · ${escapeHtml(i.summary)}</span>
        <time datetime="${escapeHtml(i.openedAt)}" title="${escapeHtml(i.openedAt)} UTC">${escapeHtml(localTime(i.openedAt))}</time>
        ${acked.has(i.id) ? ackMark(i.id) : '<span class="open-hint">open</span>'}
      </li>`)
    .join('');
}

function renderPanel() {
  const incident = panelId ? seen.get(panelId) : null;
  if (!incident) {
    panelHost.innerHTML = '';
    return;
  }
  const id = incident.id;
  const isAcked = acked.has(id);
  panelHost.innerHTML = `<section data-testid="incident-panel" data-id="${escapeHtml(id)}" class="panel ${escapeHtml(incident.severity)}">
      <div class="panel-head">
        <h2><span class="id">${escapeHtml(id)}</span> <span class="sev">${escapeHtml(incident.severity)}</span></h2>
        <button type="button" class="close" data-testid="panel-close" aria-label="close panel">close</button>
      </div>
      <p class="what">${escapeHtml(incident.service)} · ${escapeHtml(incident.region)} · ${escapeHtml(incident.summary)}</p>
      <p class="when">opened <time datetime="${escapeHtml(incident.openedAt)}" title="${escapeHtml(incident.openedAt)} UTC">${escapeHtml(localTime(incident.openedAt))}</time></p>
      <div class="panel-actions">
        ${
          isAcked
            ? ackMark(id)
            : `<button type="button" data-testid="panel-ack" data-id="${escapeHtml(id)}"${pending.has(id) ? ' disabled' : ''}>Ack</button>`
        }
      </div>
    </section>`;
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
    latestCursor = page.cursor ?? latestCursor;
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

window.__board = { incidents: seen, acks: () => import('./api.js').then((m) => m.acks), latestCursor: () => latestCursor, panelId: () => panelId };

await refresh();
setInterval(refresh, 2000);
