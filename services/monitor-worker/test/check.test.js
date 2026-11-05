import { describe, expect, it } from 'vitest';
import { runCheck } from '../src/check.js';

const clock = () => {
  let t = 0;
  return () => (t += 40);
};

describe('runCheck', () => {
  it('marks a 2xx response as up', async () => {
    const result = await runCheck('http://x', { fetchImpl: async () => ({ ok: true, status: 200 }), now: clock() });
    expect(result).toEqual({ status: 'up', statusCode: 200, latencyMs: 40, error: null });
  });

  it('marks a 5xx response as down', async () => {
    const result = await runCheck('http://x', { fetchImpl: async () => ({ ok: false, status: 503 }), now: clock() });
    expect(result).toMatchObject({ status: 'down', statusCode: 503, error: 'HTTP 503' });
  });

  it('marks a network error as down', async () => {
    const fetchImpl = async () => {
      throw new Error('ECONNREFUSED');
    };
    const result = await runCheck('http://x', { fetchImpl, now: clock() });
    expect(result).toMatchObject({ status: 'down', statusCode: null, error: 'ECONNREFUSED' });
  });

  it('reports timeouts clearly', async () => {
    const fetchImpl = async () => {
      throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    };
    const result = await runCheck('http://x', { fetchImpl, timeoutMs: 1234, now: clock() });
    expect(result.error).toBe('timeout after 1234ms');
  });
});
