import { Queue, Worker } from 'bullmq';
import { QUEUES, createDb, createLogger, createRedis } from '@opsdeck/shared';
import { checkService } from './check-service.js';

const logger = createLogger('monitor-worker');
const db = createDb();
const redis = createRedis();
const intervalMs = Number(process.env.CHECK_INTERVAL_MS ?? 15000);
const timeoutMs = Number(process.env.CHECK_TIMEOUT_MS ?? 5000);

const checksQueue = new Queue(QUEUES.CHECKS, { connection: redis });
const eventsQueue = new Queue(QUEUES.EVENTS, { connection: redis });

// A single "sweep" scheduler fans out one "check" job per registered service.
await checksQueue.upsertJobScheduler('sweep', { every: intervalMs }, { name: 'sweep' });

const worker = new Worker(
  QUEUES.CHECKS,
  async (job) => {
    if (job.name === 'sweep') {
      const { rows } = await db.query('SELECT id FROM services');
      await checksQueue.addBulk(
        rows.map((r) => ({
          name: 'check',
          data: { serviceId: r.id, trigger: 'scheduled' },
          opts: { removeOnComplete: 1000, removeOnFail: 1000 },
        })),
      );
      return { scheduled: rows.length };
    }
    if (job.name === 'check') {
      return checkService({ db, eventsQueue, logger, timeoutMs }, job.data.serviceId);
    }
    throw new Error(`unknown job ${job.name}`);
  },
  { connection: createRedis(), concurrency: 10 },
);

worker.on('failed', (job, err) => logger.error({ job: job?.name, err }, 'job failed'));
logger.info({ intervalMs, timeoutMs }, 'monitor worker started');

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  await worker.close();
  await Promise.all([checksQueue.close(), eventsQueue.close()]);
  await db.close();
  redis.disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
