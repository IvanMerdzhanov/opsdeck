import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

const logger = { error: vi.fn(), info: vi.fn() };
const KEY = 'test-admin-key';
const SERVICE = { id: '11111111-1111-1111-1111-111111111111', name: 'api', url: 'http://api/health' };

function setup(queryImpl = async () => ({ rows: [], rowCount: 0 })) {
  const db = { query: vi.fn(queryImpl), ping: vi.fn(async () => {}) };
  const checksQueue = { add: vi.fn(async () => ({ id: 'job-1' })) };
  return { db, checksQueue, app: createApp({ db, checksQueue, logger, adminKey: KEY }) };
}

describe('registry-api', () => {
  it('rejects writes without a valid API key', async () => {
    const { app, db } = setup();
    const body = { name: 'api', url: 'http://api/health', owner: 'team-a' };
    await request(app).post('/services').send(body).expect(401, { error: 'invalid_api_key' });
    await request(app).post('/services').set('x-api-key', 'wrong').send(body).expect(401);
    await request(app).delete(`/services/${SERVICE.id}`).expect(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('disables writes entirely when no key is configured', async () => {
    const db = { query: vi.fn(), ping: vi.fn() };
    const app = createApp({ db, checksQueue: {}, logger });
    await request(app).post('/services').set('x-api-key', '').send({}).expect(503, { error: 'writes_disabled' });
  });

  it('reports liveness and readiness', async () => {
    const { app } = setup();
    await request(app).get('/health').expect(200, { status: 'ok' });
    await request(app).get('/ready').expect(200, { status: 'ready' });
  });

  it('rejects an invalid service with field errors', async () => {
    const { app, db } = setup();
    const res = await request(app).post('/services').set('x-api-key', KEY).send({ name: 'x', url: 'not-a-url' }).expect(400);
    expect(res.body.error).toBe('validation_failed');
    expect(Object.keys(res.body.details)).toEqual(expect.arrayContaining(['name', 'url', 'owner']));
    expect(db.query).not.toHaveBeenCalled();
  });

  it('creates a service with a default environment', async () => {
    const { app, db } = setup(async () => ({ rows: [SERVICE] }));
    await request(app)
      .post('/services')
      .set('x-api-key', KEY)
      .send({ name: 'api', url: 'http://api/health', owner: 'team-a' })
      .expect(201);
    expect(db.query.mock.calls[0][1]).toEqual(['api', 'http://api/health', 'team-a', 'dev', null]);
  });

  it('maps a duplicate name to 409', async () => {
    const { app } = setup(async () => {
      throw Object.assign(new Error('dup'), { code: '23505' });
    });
    await request(app)
      .post('/services')
      .set('x-api-key', KEY)
      .send({ name: 'api', url: 'http://api/health', owner: 'team-a' })
      .expect(409, { error: 'conflict' });
  });

  it('enqueues a diagnostic check for an existing service', async () => {
    const { app, checksQueue } = setup(async () => ({ rows: [SERVICE] }));
    const res = await request(app).post(`/services/${SERVICE.id}/diagnostics`).expect(202);
    expect(res.body).toEqual({ jobId: 'job-1', serviceId: SERVICE.id });
    expect(checksQueue.add).toHaveBeenCalledWith('check', { serviceId: SERVICE.id, trigger: 'manual' }, expect.any(Object));
  });

  it('returns 404 for diagnostics on an unknown service', async () => {
    const { app, checksQueue } = setup();
    await request(app).post(`/services/${SERVICE.id}/diagnostics`).expect(404);
    expect(checksQueue.add).not.toHaveBeenCalled();
  });
});
