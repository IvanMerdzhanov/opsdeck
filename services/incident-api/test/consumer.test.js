import { describe, expect, it, vi } from 'vitest';
import { EVENTS } from '@opsdeck/shared';
import { handleEvent } from '../src/consumer.js';

const logger = { warn: vi.fn() };
const failed = { serviceId: 's1', serviceName: 'api', error: 'HTTP 503' };

function fakeDb(responses) {
  const queue = [...responses];
  return { query: vi.fn(async () => queue.shift() ?? { rows: [] }) };
}

describe('handleEvent', () => {
  it('opens a new incident when none is active', async () => {
    const db = fakeDb([{ rows: [] }, { rows: [{ id: 'inc-1' }] }]);
    const result = await handleEvent({ db, logger }, EVENTS.SERVICE_FAILED, failed);
    expect(result).toEqual({ incidentId: 'inc-1', created: true });
    expect(db.query.mock.calls[1][1]).toEqual(['s1', 'api is down', 'high']);
  });

  it('appends to the active incident instead of opening a duplicate', async () => {
    const db = fakeDb([{ rows: [{ id: 'inc-1' }] }]);
    const result = await handleEvent({ db, logger }, EVENTS.SERVICE_FAILED, failed);
    expect(result).toEqual({ incidentId: 'inc-1', created: false });
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[1][0]).toMatch(/INSERT INTO incident_events/);
  });

  it('auto-resolves active incidents on recovery', async () => {
    const db = fakeDb([{ rows: [{ id: 'inc-1' }] }]);
    const result = await handleEvent({ db, logger }, EVENTS.SERVICE_RECOVERED, { serviceId: 's1', latencyMs: 12 });
    expect(result).toEqual({ resolved: 1 });
    expect(db.query.mock.calls[1][1]).toEqual(['inc-1', 'auto_resolved', 'health check recovered (12ms)', 'system']);
  });
});
