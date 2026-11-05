/* OpsDeck static demo: a simulated backend that runs entirely in the browser.
 *
 * Loaded only in the GitHub Pages build (scripts/build-pages.sh), before app.js. It intercepts
 * fetch() calls to /api/* and answers them like the real services, following the same rules:
 *  - a check failure opens an incident only on an up -> down transition (monitor-worker/src/state.js)
 *  - a repeated failure appends to the open incident; recovery auto-resolves it (incident-api/src/consumer.js)
 *  - MTTR and 24h uptime are computed from incident and check history (incident-api/src/metrics.js)
 * Nothing is sent anywhere; state lives in memory and resets on reload.
 */
(function () {
  'use strict';

  const CHECK_TIMEOUT_MS = 3000;
  const SWEEP_MS = 10000;
  const HOUR = 3600 * 1000;
  const now = () => Date.now();
  const iso = (t) => new Date(t).toISOString();
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

  const demo = { healthy: true, latencyMs: 0 };
  const services = [];
  const checks = []; // { service_id, status, latency_ms, error, checked_at(ms) }
  const incidents = []; // { id, service_id, title, status, severity, assignee, opened_at(ms), resolved_at(ms|null), timeline[] }

  function addService(s) {
    const svc = { id: uuid(), environment: 'dev', version: null, created_at: iso(now()), ...s };
    services.push(svc);
    return svc;
  }

  // ---- seed: a day of history so uptime and MTTR have something to show --------------------
  const demoTarget = addService({ name: 'demo-target', url: 'http://demo-target:4000/health', owner: 'platform-team', version: '1.0.0' });
  addService({ name: 'payments-api', url: 'https://payments.internal.example/health', owner: 'payments-team', environment: 'prod', version: '4.2.1' });
  addService({ name: 'example-dot-com', url: 'https://example.com', owner: 'web-team', environment: 'prod', version: 'n/a' });

  const outageStart = now() - 5 * HOUR;
  const outageEnd = outageStart + 7 * 60 * 1000;
  for (let t = now() - 24 * HOUR; t < now(); t += 5 * 60 * 1000) {
    for (const s of services) {
      const down = s === demoTarget && t >= outageStart && t < outageEnd;
      checks.push({ service_id: s.id, status: down ? 'down' : 'up', latency_ms: down ? null : 15 + Math.round(Math.random() * 60), error: down ? 'HTTP 503' : null, checked_at: t });
    }
  }
  incidents.push({
    id: uuid(), service_id: demoTarget.id, title: 'demo-target is down', status: 'resolved', severity: 'high',
    assignee: 'maria', root_cause: 'Connection pool exhausted after deploy', opened_at: outageStart, resolved_at: outageEnd,
    timeline: [
      { type: 'opened', message: 'HTTP 503', author: 'system', created_at: iso(outageStart) },
      { type: 'auto_resolved', message: 'health check recovered (21ms)', author: 'system', created_at: iso(outageEnd) },
    ],
  });

  // ---- monitor + incident logic ------------------------------------------------------------
  const lastStatus = (id) => {
    for (let i = checks.length - 1; i >= 0; i--) if (checks[i].service_id === id) return checks[i];
    return null;
  };

  async function runCheck(svc) {
    let result;
    if (svc === demoTarget) {
      const wait = Math.min(demo.latencyMs, CHECK_TIMEOUT_MS);
      await new Promise((r) => setTimeout(r, wait));
      if (demo.latencyMs > CHECK_TIMEOUT_MS) result = { status: 'down', latency_ms: CHECK_TIMEOUT_MS, error: `timeout after ${CHECK_TIMEOUT_MS}ms` };
      else if (!demo.healthy) result = { status: 'down', latency_ms: 2 + Math.round(Math.random() * 5), error: 'HTTP 503' };
      else result = { status: 'up', latency_ms: Math.max(1, demo.latencyMs) + Math.round(Math.random() * 5), error: null };
    } else {
      result = { status: 'up', latency_ms: 15 + Math.round(Math.random() * 60), error: null };
    }
    const previous = lastStatus(svc.id)?.status;
    checks.push({ service_id: svc.id, ...result, checked_at: now() });
    if (result.status === 'down' && previous !== 'down') onFailed(svc, result);
    else if (result.status === 'down') appendToOpen(svc, 'check_failed', result.error);
    else if (previous === 'down') onRecovered(svc, result);
  }

  const openIncident = (svc) => incidents.find((i) => i.service_id === svc.id && i.status !== 'resolved');
  function appendToOpen(svc, type, message) {
    const inc = openIncident(svc);
    if (inc) inc.timeline.push({ type, message, author: 'system', created_at: iso(now()) });
    return inc;
  }
  function onFailed(svc, result) {
    if (appendToOpen(svc, 'check_failed', result.error)) return;
    incidents.unshift({
      id: uuid(), service_id: svc.id, title: `${svc.name} is down`, status: 'open', severity: 'high',
      assignee: null, root_cause: null, opened_at: now(), resolved_at: null,
      timeline: [{ type: 'opened', message: result.error, author: 'system', created_at: iso(now()) }],
    });
  }
  function onRecovered(svc, result) {
    const inc = openIncident(svc);
    if (!inc) return;
    inc.status = 'resolved';
    inc.resolved_at = now();
    inc.timeline.push({ type: 'auto_resolved', message: `health check recovered (${result.latency_ms}ms)`, author: 'system', created_at: iso(now()) });
  }

  setInterval(() => services.forEach((s) => runCheck(s)), SWEEP_MS);
  services.forEach((s) => runCheck(s));

  // ---- metrics -----------------------------------------------------------------------------
  function summary() {
    const recent = incidents.filter((i) => i.opened_at > now() - 30 * 24 * HOUR);
    const resolved = recent.filter((i) => i.resolved_at);
    const mttr = resolved.length
      ? Math.round((resolved.reduce((s, i) => s + (i.resolved_at - i.opened_at), 0) / resolved.length / 60000) * 10) / 10
      : null;
    const since = now() - 24 * HOUR;
    return {
      openIncidents: recent.filter((i) => i.status !== 'resolved').length,
      incidentsLast30d: recent.length,
      mttrMinutes: mttr,
      uptime24h: services.map((s) => {
        const window = checks.filter((c) => c.service_id === s.id && c.checked_at > since);
        const up = window.filter((c) => c.status === 'up').length;
        return { serviceId: s.id, name: s.name, percent: window.length ? Math.round((up / window.length) * 10000) / 100 : null };
      }),
    };
  }

  // ---- fake HTTP layer ---------------------------------------------------------------------
  const json = (status, body) =>
    new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  function route(method, path, body, headers) {
    const adminKey = headers['x-api-key'];
    let m;
    if (method === 'GET' && path === '/api/registry/services') {
      return json(200, services.map((s) => {
        const last = lastStatus(s.id);
        return { ...s, last_status: last?.status ?? null, last_latency_ms: last?.latency_ms ?? null, last_checked_at: last ? iso(last.checked_at) : null };
      }));
    }
    if (method === 'POST' && path === '/api/registry/services') {
      if (!adminKey) return json(401, { error: 'invalid_api_key' });
      const details = {};
      if (!body.name || body.name.trim().length < 2) details.name = ['too short'];
      try { if (!/^https?:$/.test(new URL(body.url).protocol)) throw 0; } catch { details.url = ['must be an http(s) URL']; }
      if (!body.owner) details.owner = ['required'];
      if (Object.keys(details).length) return json(400, { error: 'validation_failed', details });
      if (services.some((s) => s.name === body.name.trim())) return json(409, { error: 'conflict' });
      const svc = addService({ name: body.name.trim(), url: body.url, owner: body.owner, environment: body.environment || 'dev' });
      runCheck(svc);
      return json(201, svc);
    }
    if (method === 'POST' && (m = path.match(/^\/api\/registry\/services\/([^/]+)\/diagnostics$/))) {
      const svc = services.find((s) => s.id === m[1]);
      if (!svc) return json(404, { error: 'service_not_found' });
      runCheck(svc);
      return json(202, { jobId: uuid(), serviceId: svc.id });
    }
    if (method === 'GET' && path === '/api/incidents/incidents') {
      return json(200, incidents.map(({ timeline: _t, ...i }) => ({
        ...i, opened_at: iso(i.opened_at), resolved_at: i.resolved_at ? iso(i.resolved_at) : null,
        service_name: services.find((s) => s.id === i.service_id)?.name,
      })));
    }
    if (method === 'GET' && path === '/api/incidents/metrics/summary') return json(200, summary());
    if (method === 'POST' && path === '/api/demo/chaos') {
      if (typeof body.healthy === 'boolean') demo.healthy = body.healthy;
      if (Number.isFinite(body.latencyMs)) demo.latencyMs = Math.min(10000, Math.max(0, body.latencyMs));
      return json(200, { ...demo });
    }
    return json(404, { error: 'not_found' });
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const path = url.pathname.replace(/^.*?(\/api\/)/, '$1');
    if (!path.startsWith('/api/')) return realFetch(input, options);
    const headers = options.headers || {};
    let body = {};
    try { body = options.body ? JSON.parse(options.body) : {}; } catch { return json(400, { error: 'invalid_json' }); }
    await new Promise((r) => setTimeout(r, 60 + Math.random() * 120)); // feel like a network
    return route((options.method || 'GET').toUpperCase(), path, body, headers);
  };
})();
