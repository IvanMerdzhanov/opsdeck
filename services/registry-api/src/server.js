import { Queue } from 'bullmq';
import { QUEUES, createDb, createLogger, createRedis } from '@opsdeck/shared';
import { createApp } from './app.js';

const logger = createLogger('registry-api');
const db = createDb({ logger });
const redis = createRedis({ logger });
const checksQueue = new Queue(QUEUES.CHECKS, { connection: redis });

const app = createApp({ db, redis, checksQueue, logger, adminKey: process.env.ADMIN_API_KEY });
const port = Number(process.env.PORT ?? 3001);
const server = app.listen(port, () => logger.info({ port }, 'listening'));

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close();
  await checksQueue.close();
  await db.close();
  redis.disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
