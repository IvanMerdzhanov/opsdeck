import { createDb, createLogger, createRedis } from '@opsdeck/shared';
import { createApp } from './app.js';
import { startConsumer } from './consumer-worker.js';

const logger = createLogger('incident-api');
const db = createDb({ logger });
const redis = createRedis({ logger });

// HTTP API and event consumer share one process for now; see docs/adr/0003.
const consumer = startConsumer({ db, logger });

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
