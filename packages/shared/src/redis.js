import { Redis } from 'ioredis';

// maxRetriesPerRequest: null is required by BullMQ workers. ioredis reconnects automatically;
// the listener keeps connection errors as log lines instead of "Unhandled error event" noise.
export function createRedis({ url = process.env.REDIS_URL ?? 'redis://localhost:6379', logger } = {}) {
  const redis = new Redis(url, { maxRetriesPerRequest: null });
  redis.on('error', (err) => logger?.warn({ err: err.message }, 'redis connection error'));
  return redis;
}
