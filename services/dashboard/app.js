const REGISTRY = '/api/registry';
const INCIDENTS = '/api/incidents';

const el = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const ago = (ts) => {
  if (!ts) return '—';
  const m = Math.round((Date.now() - new Date(ts)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};

// The admin key lives only in this browser. Storage can be unavailable (private mode), so guard it.
const store = {
  get: () => { try { return localStorage.getItem('opsdeck.adminKey') ?? ''; } catch { return ''; } },
  set: (v) => { try { v ? localStorage.setItem('opsdeck.adminKey', v) : localStorage.removeItem('opsdeck.adminKey'); } catch { /* ignore */ } },
};
let adminKey = store.get();

async function api(url, options = {}) {
  const headers = { 'content-type': 'application/json', ...(adminKey && { 'x-api-key': adminKey }) };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 429) throw new Error('Slow down: demo actions are rate-limited');
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(body?.error ?? res.statusText), { body });
  return body;
}

async function refresh() {
  const [services, incidents, summary] = await Promise.all([
    api(`${REGISTRY}/services`),
    api(`${INCIDENTS}/incidents`),
    api(`${INCIDENTS}/metrics/summary`),
  ]);
  const uptime = Object.fromEntries(summary.uptime24h.map((u) => [u.serviceId, u.percent]));

  el('kpis').innerHTML = [
    ['Services', services.length],
    ['Down now', services.filter((s) => s.last_status === 'down').length],
    ['Open incidents', summary.openIncidents],
    ['MTTR (30d)', summary.mttrMinutes == null ? '—' : `${summary.mttrMinutes}m`],
  ].map(([label, value]) => `<div class="kpi"><b>${esc(value)}</b><span>${label}</span></div>`).join('');

  el('services').innerHTML = services.map((s) => `
    <tr>
      <td><span class="dot ${esc(s.last_status)}"></span>${esc(s.name)}<div class="muted">${esc(s.url)}</div></td>
      <td><span class="tag">${esc(s.environment)}</span></td>
      <td>${esc(s.owner)}</td>
      <td>${s.last_latency_ms == null ? '—' : `${s.last_latency_ms}ms`}</td>
      <td>${uptime[s.id] == null ? '—' : `${uptime[s.id]}%`}</td>
      <td><button data-diagnose="${esc(s.id)}">Check now</button></td>
    </tr>`).join('') || '<tr><td colspan="6" class="muted">No services registered.</td></tr>';

  el('incidents').innerHTML = incidents.map((i) => `
    <tr>
      <td>${esc(i.title)}<div class="muted">${esc(i.assignee ?? 'unassigned')}</div></td>
      <td><span class="tag ${esc(i.status)}">${esc(i.status)}</span></td>
      <td>${ago(i.opened_at)}</td>
    </tr>`).join('') || '<tr><td colspan="3" class="muted">No incidents. 🎉</td></tr>';
}

document.addEventListener('click', async (e) => {
  const id = e.target.dataset?.diagnose;
  if (!id) return;
  e.target.disabled = true;
  try {
    await api(`${REGISTRY}/services/${id}/diagnostics`, { method: 'POST' });
    setTimeout(refresh, 1500);
  } finally {
    setTimeout(() => (e.target.disabled = false), 1500);
  }
});

el('register').addEventListener('submit', async (e) => {
  e.preventDefault();
  el('register-error').textContent = '';
  try {
    await api(`${REGISTRY}/services`, {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });
    e.target.reset();
    refresh();
  } catch (err) {
    if (err.message === 'invalid_api_key') return (el('register-error').textContent = 'Admin key rejected.');
    const details = err.body?.details ? ` — ${Object.keys(err.body.details).join(', ')}` : '';
    el('register-error').textContent = `${err.message}${details}`;
  }
});

function renderAdmin() {
  el('register').hidden = !adminKey;
  el('admin-state').textContent = adminKey ? 'Admin key set: you can register services.' : 'Read-only mode.';
  el('admin-toggle').textContent = adminKey ? 'Admin ✓' : 'Admin';
}
el('admin-toggle').addEventListener('click', () => (el('admin-bar').hidden = !el('admin-bar').hidden));
el('admin-save').addEventListener('click', () => {
  adminKey = el('admin-key').value.trim();
  store.set(adminKey);
  el('admin-key').value = '';
  renderAdmin();
});
el('admin-clear').addEventListener('click', () => {
  adminKey = '';
  store.set('');
  renderAdmin();
});

const CHAOS = {
  break: { body: { healthy: false, latencyMs: 0 }, msg: 'demo-target is now failing. Watch the incident open.' },
  slow: { body: { healthy: true, latencyMs: 4000 }, msg: 'demo-target now takes 4s, above the 3s check timeout.' },
  heal: { body: { healthy: true, latencyMs: 0 }, msg: 'demo-target is healthy again. The incident will auto-resolve.' },
};
document.addEventListener('click', async (e) => {
  const action = CHAOS[e.target.dataset?.chaos];
  if (!action) return;
  try {
    await api('/api/demo/chaos', { method: 'POST', body: JSON.stringify(action.body) });
    const demo = (await api(`${REGISTRY}/services`)).find((s) => s.name === 'demo-target');
    if (demo) await api(`${REGISTRY}/services/${demo.id}/diagnostics`, { method: 'POST' });
    el('demo-state').textContent = action.msg;
    setTimeout(() => refresh().catch(console.error), action.body.latencyMs ? 5000 : 1500);
  } catch (err) {
    el('demo-state').textContent = err.message;
  }
});

renderAdmin();
refresh().catch(console.error);
setInterval(() => refresh().catch(console.error), 10000);
