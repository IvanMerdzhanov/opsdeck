import { Worker } from 'bullmq';
import { QUEUES, createDb, createLogger, createRedis } from '@opsdeck/shared';
import { createApp } from './app.js';
import { handleEvent } from './consumer.js';

const logger = createLogger('incident-api');
const db = createDb({ logger });
const redis = createRedis({ logger });

// HTTP API and event consumer share one process for now; see docs/adr/0003.
const consumer = new Worker(QUEUES.EVENTS, (job) => handleEvent({ db, logger }, job.name, job.data), {
  connection: createRedis({ logger }),
  concurrency: 1,
});
consumer.on('failed', (job, err) => logger.error({ event: job?.name, err }, 'event handling failed'));

const app = createApp({ db, redis, logger, adminKey: process.env.ADMIN_API_KEY });
const port = Number(process.env.PORT ?? 3002);
const server = app.listen(port, () => logger.info({ port }, 'listening'));

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close();
  await consumer.close();
  await db.close();
  redis.disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
