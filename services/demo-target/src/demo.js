// A deliberately breakable service, for demos, smoke tests and postmortem practice.
//   GET  /health -> 200, or 503 when broken
//   POST /chaos  {"healthy": false, "latencyMs": 3000}
import http from 'node:http';

export function createDemoServer() {
  const state = { healthy: true, latencyMs: 0 };
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  return http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      if (state.latencyMs) await new Promise((r) => setTimeout(r, state.latencyMs));
      return json(res, state.healthy ? 200 : 503, { status: state.healthy ? 'ok' : 'degraded' });
    }
    if (req.method === 'POST' && req.url === '/chaos') {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        const input = JSON.parse(body || '{}');
        if (typeof input.healthy === 'boolean') state.healthy = input.healthy;
        if (Number.isFinite(input.latencyMs)) state.latencyMs = Math.min(10000, Math.max(0, input.latencyMs));
        return json(res, 200, state);
      } catch {
        return json(res, 400, { error: 'invalid_json' });
      }
    }
    json(res, 404, { error: 'not_found' });
  });
}
