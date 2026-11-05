import { Worker } from 'bullmq';
import { QUEUES, createRedis } from '@opsdeck/shared';
import { handleEvent } from './consumer.js';

// concurrency 1 + the partial unique index keep "one active incident per service" (ADR-0003).
export function startConsumer({ db, logger, workerOptions = {} }) {
  const worker = new Worker(QUEUES.EVENTS, (job) => handleEvent({ db, logger }, job.name, job.data), {
    connection: createRedis({ logger }),
    concurrency: 1,
    ...workerOptions,
  });
  worker.on('failed', (job, err) => logger.error({ event: job?.name, err }, 'event handling failed'));
  return worker;
}
