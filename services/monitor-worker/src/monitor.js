import { Queue, Worker } from 'bullmq';
import { QUEUES, createRedis } from '@opsdeck/shared';
import { checkService } from './check-service.js';
import { createGuardedFetch } from './destination.js';

// Starts the scheduled sweep and the check worker. Returns a handle with close().
export async function startMonitor({ db, logger, intervalMs, timeoutMs, allowedHosts, workerOptions = {} }) {
  const redis = createRedis({ logger });
  const checksQueue = new Queue(QUEUES.CHECKS, { connection: redis });
  const eventsQueue = new Queue(QUEUES.EVENTS, { connection: redis });
  const fetchImpl = createGuardedFetch({ allowedHosts });

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
        return checkService({ db, eventsQueue, logger, timeoutMs, allowedHosts, fetchImpl }, job.data.serviceId);
      }
      throw new Error(`unknown job ${job.name}`);
    },
    { connection: createRedis({ logger }), concurrency: 10, ...workerOptions },
  );
  worker.on('failed', (job, err) => logger.error({ job: job?.name, err }, 'job failed'));
  logger.info({ intervalMs, timeoutMs, allowedHosts: [...allowedHosts] }, 'monitor started');

  return {
    async close() {
      await worker.close();
      await Promise.all([checksQueue.close(), eventsQueue.close()]);
      redis.disconnect();
    },
  };
}
