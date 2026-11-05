import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BlockedDestinationError, createGuardedFetch, createGuardedLookup } from '../src/destination.js';

const lookupOnce = (guarded, host) =>
  new Promise((resolve) => guarded(host, {}, (err, address) => resolve({ err, address })));

describe('createGuardedLookup (connect-time enforcement)', () => {
  it('blocks a rebinding host: public on the first lookup, private on the connecting one', async () => {
    let calls = 0;
    const dnsLookup = (_h, _o, cb) =>
      cb(null, [{ address: ++calls === 1 ? '93.184.215.14' : '169.254.169.254', family: 4 }]);
    const guarded = createGuardedLookup({ dnsLookup });
    expect((await lookupOnce(guarded, 'rebind.example')).err).toBeNull(); // first answer: public
    expect((await lookupOnce(guarded, 'rebind.example')).err).toBeInstanceOf(BlockedDestinationError);
  });

  it('blocks when any resolved address is private', async () => {
    const dnsLookup = (_h, _o, cb) => cb(null, [{ address: '93.184.215.14', family: 4 }, { address: '10.0.0.1', family: 4 }]);
    expect((await lookupOnce(createGuardedLookup({ dnsLookup }), 'mixed.example')).err).toBeInstanceOf(BlockedDestinationError);
  });

  it('lets allow-listed internal hosts through', async () => {
    const dnsLookup = (_h, _o, cb) => cb(null, [{ address: '172.18.0.4', family: 4 }]);
    const guarded = createGuardedLookup({ dnsLookup, allowedHosts: new Set(['demo-target:4000']) });
    expect(await lookupOnce(guarded, 'demo-target')).toEqual({ err: null, address: '172.18.0.4' });
  });
});

describe('createGuardedFetch (real socket)', () => {
  // A fake resolver mapping the test hostname to loopback, so the test needs no network DNS.
  const dnsLookup = (_h, _o, cb) => cb(null, [{ address: '127.0.0.1', family: 4 }]);
  let server;
  let port;
  beforeAll(async () => {
    server = http.createServer((_req, res) => res.end('ok'));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
  });
  afterAll(() => server.close());

  it('refuses to connect to a hostname that resolves to loopback', async () => {
    const guardedFetch = createGuardedFetch({ dnsLookup });
    const err = await guardedFetch(`http://service.test:${port}/`).catch((e) => e);
    expect(err.cause).toBeInstanceOf(BlockedDestinationError);
  });

  it('connects when the host is allow-listed', async () => {
    const guardedFetch = createGuardedFetch({ dnsLookup, allowedHosts: new Set([`service.test:${port}`]) });
    const res = await guardedFetch(`http://service.test:${port}/`);
    expect(await res.text()).toBe('ok');
  });
});
