import express from 'express';
import { HttpError, errorHandler, mountProbes, requireApiKey } from '@opsdeck/shared';
import { parse, serviceSchema, serviceUpdateSchema } from './validation.js';

export function createApp({ db, redis, checksQueue, logger, adminKey }) {
  const app = express();
  const admin = requireApiKey(adminKey);
  app.use(express.json());
  mountProbes(app, { db, redis, logger });

  async function findService(id) {
    const { rows } = await db.query('SELECT * FROM services WHERE id = $1', [id]);
    if (!rows[0]) throw new HttpError(404, 'service_not_found');
    return rows[0];
  }

  app.get('/services', async (req, res) => {
    const { rows } = await db.query(
      `SELECT s.*, c.status AS last_status, c.latency_ms AS last_latency_ms, c.checked_at AS last_checked_at
         FROM services s
         LEFT JOIN LATERAL (
           SELECT status, latency_ms, checked_at FROM checks
            WHERE service_id = s.id ORDER BY checked_at DESC LIMIT 1
         ) c ON true
        WHERE ($1::text IS NULL OR s.environment = $1)
        ORDER BY s.name`,
      [req.query.environment ?? null],
    );
    res.json(rows);
  });

  app.post('/services', admin, async (req, res) => {
    const s = parse(serviceSchema, req.body);
    const { rows } = await db.query(
      `INSERT INTO services (name, url, owner, environment, version)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [s.name, s.url, s.owner, s.environment, s.version ?? null],
    );
    res.status(201).json(rows[0]);
  });

  app.get('/services/:id', async (req, res) => {
    res.json(await findService(req.params.id));
  });

  app.patch('/services/:id', admin, async (req, res) => {
    const patch = parse(serviceUpdateSchema, req.body);
    // Keys come from the zod schema (unknown keys are stripped), so interpolating them is safe.
    const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
    if (keys.length === 0) throw new HttpError(400, 'empty_update');
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await db.query(
      `UPDATE services SET ${sets} WHERE id = $1 RETURNING *`,
      [req.params.id, ...keys.map((k) => patch[k])],
    );
    if (!rows[0]) throw new HttpError(404, 'service_not_found');
    res.json(rows[0]);
  });

  app.delete('/services/:id', admin, async (req, res) => {
    const { rowCount } = await db.query('DELETE FROM services WHERE id = $1', [req.params.id]);
    if (!rowCount) throw new HttpError(404, 'service_not_found');
    res.status(204).end();
  });

  app.get('/services/:id/checks', async (req, res) => {
    await findService(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const { rows } = await db.query(
      'SELECT * FROM checks WHERE service_id = $1 ORDER BY checked_at DESC LIMIT $2',
      [req.params.id, limit],
    );
    res.json(rows);
  });

  // On-demand diagnostic: enqueue an immediate health check for one service.
  // Public on purpose (read-only effect); the edge proxy rate-limits it.
  app.post('/services/:id/diagnostics', async (req, res) => {
    const service = await findService(req.params.id);
    const job = await checksQueue.add(
      'check',
      { serviceId: service.id, trigger: 'manual' },
      { removeOnComplete: 1000, removeOnFail: 1000 },
    );
    res.status(202).json({ jobId: job.id, serviceId: service.id });
  });

  app.use((_req, _res, next) => next(new HttpError(404, 'not_found')));
  app.use(errorHandler(logger));
  return app;
}
