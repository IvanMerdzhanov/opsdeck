// Performs a single HTTP health check. fetchImpl/now are injectable for tests.
export async function runCheck(url, { timeoutMs = 5000, fetchImpl = fetch, now = () => performance.now() } = {}) {
  const started = now();
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
    const latencyMs = Math.round(now() - started);
    return {
      status: res.ok ? 'up' : 'down',
      statusCode: res.status,
      latencyMs,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      status: 'down',
      statusCode: null,
      latencyMs: Math.round(now() - started),
      error: err.name === 'TimeoutError' ? `timeout after ${timeoutMs}ms` : err.message,
    };
  }
}
