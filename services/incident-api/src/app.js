import express from 'express';
import { z } from 'zod';
import { HttpError, errorHandler, mountProbes, requireApiKey } from '@opsdeck/shared';
import { addTimelineEvent } from './consumer.js';
import { computeMttrMinutes, uptimePercent } from './metrics.js';

const updateSchema = z
  .object({
    status: z.enum(['open', 'investigating', 'resolved']).optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    assignee: z.string().trim().min(1).max(80).optional(),
    root_cause: z.string().trim().min(10).max(4000).optional(),
    author: z.string().trim().min(1).max(80).default('anonymous'),
  })
  .strict();

const noteSchema = z.object({
  author: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(4000),
});

function parse(schema, body) {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new HttpError(400, 'validation_failed', r.error.flatten().fieldErrors);
  return r.data;
}

export function createApp({ db, redis, logger, adminKey }) {
  const app = express();
  const admin = requireApiKey(adminKey);
  app.use(express.json());
  mountProbes(app, { db, redis, logger });

  async function findIncident(id) {
    const { rows } = await db.query(
      `SELECT i.*, s.name AS service_name FROM incidents i
         JOIN services s ON s.id = i.service_id WHERE i.id = $1`,
      [id],
    );
    if (!rows[0]) throw new HttpError(404, 'incident_not_found');
    return rows[0];
  }

  app.get('/incidents', async (req, res) => {
    const { rows } = await db.query(
      `SELECT i.*, s.name AS service_name FROM incidents i
         JOIN services s ON s.id = i.service_id
        WHERE ($1::text IS NULL OR i.status = $1)
        ORDER BY i.opened_at DESC LIMIT 200`,
      [req.query.status ?? null],
    );
    res.json(rows);
  });

  app.get('/incidents/:id', async (req, res) => {
    const incident = await findIncident(req.params.id);
    const { rows: timeline } = await db.query(
      'SELECT * FROM incident_events WHERE incident_id = $1 ORDER BY created_at',
      [incident.id],
    );
    res.json({ ...incident, timeline });
  });

  app.patch('/incidents/:id', admin, async (req, res) => {
    const { author, ...patch } = parse(updateSchema, req.body);
    const current = await findIncident(req.params.id);

    // Product rule: a human can't close an incident without recording a root cause.
    if (patch.status === 'resolved' && !(patch.root_cause ?? current.root_cause)) {
      throw new HttpError(422, 'root_cause_required');
    }

    const keys = Object.keys(patch);
    if (keys.length === 0) throw new HttpError(400, 'empty_update');
    const sets = keys.map((k, i) => `${k} = $${i + 2}`);
    if (patch.status === 'resolved' && current.status !== 'resolved') sets.push('resolved_at = now()');
    if (patch.status && patch.status !== 'resolved') sets.push('resolved_at = NULL');

    const { rows } = await db.query(
      `UPDATE incidents SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      [current.id, ...keys.map((k) => patch[k])],
    );
    const changes = keys.map((k) => `${k}: ${k === 'root_cause' ? 'recorded' : patch[k]}`).join(', ');
    await addTimelineEvent(db, current.id, 'updated', changes, author);
    res.json(rows[0]);
  });

  app.post('/incidents/:id/notes', admin, async (req, res) => {
    const note = parse(noteSchema, req.body);
    const incident = await findIncident(req.params.id);
    await addTimelineEvent(db, incident.id, 'note', note.message, note.author);
    res.status(201).json({ ok: true });
  });

  app.get('/metrics/summary', async (_req, res) => {
    const [{ rows: incidents }, { rows: uptime }] = await Promise.all([
      db.query(
        "SELECT status, opened_at, resolved_at FROM incidents WHERE opened_at > now() - interval '30 days'",
      ),
      db.query(
        `SELECT s.id, s.name,
                count(c.*) FILTER (WHERE c.status = 'up')::int AS up,
                count(c.*)::int AS total
           FROM services s
           LEFT JOIN checks c ON c.service_id = s.id AND c.checked_at > now() - interval '24 hours'
          GROUP BY s.id, s.name ORDER BY s.name`,
      ),
    ]);
    res.json({
      openIncidents: incidents.filter((i) => i.status !== 'resolved').length,
      incidentsLast30d: incidents.length,
      mttrMinutes: computeMttrMinutes(incidents),
      uptime24h: uptime.map((u) => ({ serviceId: u.id, name: u.name, percent: uptimePercent(u.up, u.total) })),
    });
  });

  app.use((_req, _res, next) => next(new HttpError(404, 'not_found')));
  app.use(errorHandler(logger));
  return app;
}
