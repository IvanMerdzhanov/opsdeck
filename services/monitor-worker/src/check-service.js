import { runCheck } from './check.js';
import { detectTransition } from './state.js';

export async function checkService({ db, eventsQueue, logger, timeoutMs, allowedHosts, fetchImpl }, serviceId) {
  const { rows: [service] } = await db.query('SELECT id, name, url FROM services WHERE id = $1', [serviceId]);
  if (!service) return { skipped: 'service_not_found' };

  const { rows: [previous] } = await db.query(
    'SELECT status FROM checks WHERE service_id = $1 ORDER BY checked_at DESC LIMIT 1',
    [serviceId],
  );

  const result = await runCheck(service.url, { timeoutMs, allowedHosts, fetchImpl });
  await db.query(
    `INSERT INTO checks (service_id, status, status_code, latency_ms, error)
     VALUES ($1, $2, $3, $4, $5)`,
    [serviceId, result.status, result.statusCode, result.latencyMs, result.error],
  );

  const event = detectTransition(previous?.status, result.status);
  if (event) {
    await eventsQueue.add(
      event,
      { serviceId, serviceName: service.name, ...result, at: new Date().toISOString() },
      { attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 1000 },
    );
    logger.warn({ service: service.name, event, error: result.error }, 'status transition');
  }
  return { ...result, event };
}
