import { Redis } from 'ioredis';

// maxRetriesPerRequest: null is required by BullMQ workers.
export function createRedis(url = process.env.REDIS_URL ?? 'redis://localhost:6379') {
  return new Redis(url, { maxRetriesPerRequest: null });
}
