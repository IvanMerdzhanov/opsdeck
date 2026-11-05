import { EVENTS } from '@opsdeck/shared';

export async function addTimelineEvent(db, incidentId, type, message, author = 'system') {
  await db.query(
    'INSERT INTO incident_events (incident_id, type, message, author) VALUES ($1, $2, $3, $4)',
    [incidentId, type, message, author],
  );
}

// Turns monitor events into incidents. Idempotent enough to survive BullMQ retries:
// a repeated "failed" event appends to the open incident instead of opening a new one.
export async function handleEvent({ db, logger }, name, data) {
  if (name === EVENTS.SERVICE_FAILED) {
    const { rows: [open] } = await db.query(
      "SELECT id FROM incidents WHERE service_id = $1 AND status <> 'resolved' LIMIT 1",
      [data.serviceId],
    );
    if (open) {
      await addTimelineEvent(db, open.id, 'check_failed', data.error ?? 'health check failed');
      return { incidentId: open.id, created: false };
    }
    const { rows: [incident] } = await db.query(
      'INSERT INTO incidents (service_id, title, severity) VALUES ($1, $2, $3) RETURNING id',
      [data.serviceId, `${data.serviceName} is down`, 'high'],
    );
    await addTimelineEvent(db, incident.id, 'opened', data.error ?? 'health check failed');
    logger.warn({ service: data.serviceName, incidentId: incident.id }, 'incident opened');
    return { incidentId: incident.id, created: true };
  }

  if (name === EVENTS.SERVICE_RECOVERED) {
    const { rows } = await db.query(
      `UPDATE incidents SET status = 'resolved', resolved_at = now()
        WHERE service_id = $1 AND status <> 'resolved' RETURNING id`,
      [data.serviceId],
    );
    for (const { id } of rows) {
      await addTimelineEvent(db, id, 'auto_resolved', `health check recovered (${data.latencyMs}ms)`);
    }
    return { resolved: rows.length };
  }

  logger.warn({ name }, 'ignoring unknown event');
  return { ignored: true };
}
