import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

const KEY = 'test-admin-key';
const ID = '22222222-2222-2222-2222-222222222222';
const logger = { error: vi.fn() };
const incident = { id: ID, status: 'open', root_cause: null, service_name: 'api' };

function setup() {
  const db = {
    ping: vi.fn(),
    query: vi.fn(async (sql) => (sql.includes('FROM incidents i') ? { rows: [incident] } : { rows: [{ ...incident }] })),
  };
  return { db, app: createApp({ db, logger, adminKey: KEY }) };
}

describe('incident-api', () => {
  it('requires the admin key to change an incident', async () => {
    const { app, db } = setup();
    await request(app).patch(`/incidents/${ID}`).send({ status: 'investigating' }).expect(401);
    await request(app).post(`/incidents/${ID}/notes`).send({ author: 'a', message: 'b' }).expect(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuses to resolve without a root cause', async () => {
    const { app } = setup();
    await request(app)
      .patch(`/incidents/${ID}`)
      .set('x-api-key', KEY)
      .send({ status: 'resolved' })
      .expect(422, { error: 'root_cause_required' });
  });

  it('resolves when a root cause is given', async () => {
    const { app, db } = setup();
    await request(app)
      .patch(`/incidents/${ID}`)
      .set('x-api-key', KEY)
      .send({ status: 'resolved', root_cause: 'Pool exhausted after deploy', author: 'ivan' })
      .expect(200);
    const update = db.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE incidents'));
    expect(update[0]).toContain('resolved_at = now()');
  });

  it('keeps reads public', async () => {
    const { app } = setup();
    await request(app).get('/incidents').expect(200);
  });
});
