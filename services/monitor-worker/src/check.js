import { BlockedDestinationError, assertSafeDestination } from './destination.js';

// Stable, non-sensitive error codes: check history is public, so raw error text is never stored.
function classify(err, timeoutMs) {
  if (err instanceof BlockedDestinationError) return 'blocked_destination';
  if (err.name === 'TimeoutError') return `timeout after ${timeoutMs}ms`;
  const code = err.cause?.code ?? err.code;
  if (code === 'ECONNREFUSED') return 'connection_refused';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns_failure';
  if (code?.startsWith?.('ERR_TLS') || code?.includes?.('CERT')) return 'tls_error';
  return 'connection_error';
}

// Performs one HTTP health check. Redirects are not followed (a redirect could point into the
// private network); a 3xx counts as up. fetchImpl/lookupImpl/now are injectable for tests.
export async function runCheck(
  url,
  { timeoutMs = 5000, allowedHosts, lookupImpl, fetchImpl = fetch, now = () => performance.now() } = {},
) {
  const started = now();
  try {
    await assertSafeDestination(url, { allowedHosts, lookupImpl });
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'manual' });
    const up = res.status >= 200 && res.status < 400;
    return {
      status: up ? 'up' : 'down',
      statusCode: res.status,
      latencyMs: Math.round(now() - started),
      error: up ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    return { status: 'down', statusCode: null, latencyMs: Math.round(now() - started), error: classify(err, timeoutMs) };
  }
}
