import { createDb, createLogger } from '@opsdeck/shared';
import { allowedHostsFromEnv } from './destination.js';
import { startMonitor } from './monitor.js';

const logger = createLogger('monitor-worker');
const db = createDb({ logger });
const monitor = await startMonitor({
  db,
  logger,
  intervalMs: Number(process.env.CHECK_INTERVAL_MS ?? 15000),
  timeoutMs: Number(process.env.CHECK_TIMEOUT_MS ?? 5000),
  allowedHosts: allowedHostsFromEnv(),
});

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  await monitor.close();
  await db.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
