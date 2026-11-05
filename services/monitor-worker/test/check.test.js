import { describe, expect, it } from 'vitest';
import { runCheck } from '../src/check.js';

const publicDns = async () => [{ address: '93.184.215.14', family: 4 }];
const base = { lookupImpl: publicDns };

const clock = () => {
  let t = 0;
  return () => (t += 40);
};

describe('runCheck', () => {
  it('marks a 2xx response as up', async () => {
    const result = await runCheck('http://x', { ...base, fetchImpl: async () => ({ status: 200 }), now: clock() });
    expect(result).toEqual({ status: 'up', statusCode: 200, latencyMs: 40, error: null });
  });

  it('marks a 5xx response as down', async () => {
    const result = await runCheck('http://x', { ...base, fetchImpl: async () => ({ status: 503 }), now: clock() });
    expect(result).toMatchObject({ status: 'down', statusCode: 503, error: 'HTTP 503' });
  });

  it('marks a network error as down', async () => {
    const fetchImpl = async () => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 10.1.2.3:80' } });
    };
    const result = await runCheck('http://x', { ...base, fetchImpl, now: clock() });
    // Generic code only: no internal addresses in public check history.
    expect(result).toMatchObject({ status: 'down', statusCode: null, error: 'connection_refused' });
  });

  it('reports timeouts clearly', async () => {
    const fetchImpl = async () => {
      throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    };
    const result = await runCheck('http://x', { ...base, fetchImpl, timeoutMs: 1234, now: clock() });
    expect(result.error).toBe('timeout after 1234ms');
  });

  it('does not follow redirects, and counts a 3xx as up', async () => {
    let options;
    const fetchImpl = async (_url, opts) => ((options = opts), { status: 302 });
    const result = await runCheck('http://x', { ...base, fetchImpl, now: clock() });
    expect(options.redirect).toBe('manual');
    expect(result.status).toBe('up');
  });

  it.each([
    ['http://169.254.169.254/latest/meta-data', 'cloud metadata'],
    ['http://127.0.0.1:6379', 'loopback'],
    ['http://[::1]/', 'IPv6 loopback'],
    ['http://opsdeck-db.internal:5432', 'Fly private hostname'],
    ['file:///etc/passwd', 'non-http protocol'],
  ])('blocks %s (%s) without making a request', async (url) => {
    const fetchImpl = async () => {
      throw new Error('must not be called');
    };
    const result = await runCheck(url, { ...base, fetchImpl, now: clock() });
    expect(result).toMatchObject({ status: 'down', error: 'blocked_destination' });
  });

  it('blocks public hostnames that resolve to private addresses', async () => {
    const lookupImpl = async () => [{ address: '10.0.0.5', family: 4 }];
    const result = await runCheck('http://evil.example', { lookupImpl, fetchImpl: async () => ({ status: 200 }), now: clock() });
    expect(result.error).toBe('blocked_destination');
  });

  it('allows explicitly allow-listed internal hosts', async () => {
    const result = await runCheck('http://demo-target:4000/health', {
      allowedHosts: new Set(['demo-target:4000']),
      fetchImpl: async () => ({ status: 200 }),
      now: clock(),
    });
    expect(result.status).toBe('up');
  });

  it.each([
    ['http://demo-target:6379/', 'other port on an allow-listed host'],
    ['http://127.0.0.1:5432/', 'loopback Postgres next to an allow-listed loopback origin'],
  ])('blocks %s (%s)', async (url) => {
    const fetchImpl = async () => {
      throw new Error('must not be called');
    };
    const result = await runCheck(url, {
      allowedHosts: new Set(['demo-target:4000', '127.0.0.1:4000']),
      lookupImpl: async () => [{ address: '172.18.0.4', family: 4 }], // how Docker resolves demo-target
      fetchImpl,
      now: clock(),
    });
    expect(result.error).toBe('blocked_destination');
  });
});

describe('isBlockedAddress', () => {
  it.each([
    ['93.184.215.14', false],
    ['2606:2800:220:1::1', false],
    ['10.0.0.1', true],
    ['::ffff:10.0.0.1', true],
    ['::ffff:169.254.169.254', true],
    ['fdaa:0:1::3', true], // Fly 6PN private range
  ])('%s blocked=%s', async (address, expected) => {
    const { isBlockedAddress } = await import('../src/destination.js');
    expect(isBlockedAddress(address)).toBe(expected);
  });
});
