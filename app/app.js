import { fetchIncidents, ack } from './api.js';

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const errorBox = document.querySelector('[data-testid="error"]');

/** Everything this board has seen tonight, by incident id (SCHED-4511). */
const seen = new Map();
/** id -> ackedAt, so an ack survives the next refresh (SCHED-4511). */
const acked = new Map();
/** ids with an ack in flight. */
const pending = new Set();

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

function render() {
  const incidents = ordered();
  empty.hidden = incidents.length !== 0;

  list.innerHTML = incidents
    .map((i) => {
      const isAcked = acked.has(i.id);
      const mark = isAcked
        ? `<span data-testid="acked" class="acked" title="acked ${escapeHtml(acked.get(i.id))}">acked</span>`
        : `<button data-testid="ack" data-id="${escapeHtml(i.id)}" type="button">Ack</button>`;
      return `<li data-testid="incident-row" data-id="${escapeHtml(i.id)}" class="row ${escapeHtml(i.severity)}">
        <span class="id">${escapeHtml(i.id)}</span>
        <span class="sev">${escapeHtml(i.severity)}</span>
        <span class="what">${escapeHtml(i.service)} · ${escapeHtml(i.region)} · ${escapeHtml(i.summary)}</span>
        <time datetime="${escapeHtml(i.openedAt)}" title="${escapeHtml(i.openedAt)} UTC">${escapeHtml(localTime(i.openedAt))}</time>
        ${mark}
      </li>`;
    })
    .join('');
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

list.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-testid="ack"]');
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
    button.disabled = false;
  } finally {
    pending.delete(id);
  }
});

window.__board = { incidents: seen, acks: () => import('./api.js').then((m) => m.acks), latestCursor: () => latestCursor };

await refresh();
setInterval(refresh, 2000);
