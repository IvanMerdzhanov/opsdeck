// One process, same modules: registry API, incident API + consumer, monitor, demo target, dashboard.
// Used where only a single web service is available (free hosting). See docs/adr/0005.
import path from 'node:path';
import { Queue } from 'bullmq';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { QUEUES, createDb, createLogger, createRedis } from '@opsdeck/shared';
import { createApp as createRegistryApp } from '@opsdeck/registry-api/src/app.js';
import { createApp as createIncidentApp } from '@opsdeck/incident-api/src/app.js';
import { startConsumer } from '@opsdeck/incident-api/src/consumer-worker.js';
import { startMonitor } from '@opsdeck/monitor-worker/src/monitor.js';
import { createDemoServer } from '@opsdeck/demo-target/src/demo.js';
import { migrate } from '../../../db/migrations.js';

const env = process.env;
const logger = createLogger('opsdeck');
const adminKey = env.ADMIN_API_KEY;
const demoPort = Number(env.DEMO_PORT ?? 4000);
const demoUrl = `http://127.0.0.1:${demoPort}`;

// Free Redis tiers meter every command. Idle BullMQ workers poll; these settings cut that traffic.
const leanWorker = { drainDelay: 30, stalledInterval: 300_000 };

await migrate({ vars: { DEMO_TARGET_URL: `${demoUrl}/health` }, log: (msg) => logger.info(msg) });

const db = createDb({ logger });
const redis = createRedis({ logger });
const checksQueue = new Queue(QUEUES.CHECKS, { connection: redis });

// Demo target listens on loopback only; it's reachable from outside only through /api/demo/chaos.
const demo = createDemoServer();
await new Promise((resolve) => demo.listen(demoPort, '127.0.0.1', resolve));

const monitor = await startMonitor({
  db,
  logger,
  intervalMs: Number(env.CHECK_INTERVAL_MS ?? 30000),
  timeoutMs: Number(env.CHECK_TIMEOUT_MS ?? 5000),
  allowedHosts: new Set([`127.0.0.1:${demoPort}`]), // only the demo target's exact origin; everything else must be public
  workerOptions: leanWorker,
});
const consumer = startConsumer({ db, logger, workerOptions: leanWorker });

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', Number(env.TRUST_PROXY ?? 1)); // behind the host's load balancer
app.use((_req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
  next();
});

const demoLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

app.get('/healthz', (_req, res) => res.type('text').send('ok'));
app.post('/api/registry/services/:id/diagnostics', demoLimiter); // falls through to the registry app
app.use('/api/registry', createRegistryApp({ db, redis, checksQueue, logger, adminKey }));
app.use('/api/incidents', createIncidentApp({ db, redis, logger, adminKey }));
app.post('/api/demo/chaos', demoLimiter, express.json({ limit: '1kb' }), async (req, res) => {
  const upstream = await fetch(`${demoUrl}/chaos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req.body ?? {}),
  });
  res.status(upstream.status).json(await upstream.json());
});
app.use(express.static(path.resolve(import.meta.dirname, '../../dashboard'), { index: 'index.html' }));

const port = Number(env.PORT ?? 10000);
const server = app.listen(port, () => logger.info({ port }, 'opsdeck all-in-one listening'));

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close();
  demo.close();
  await Promise.all([monitor.close(), consumer.close(), checksQueue.close()]);
  await db.close();
  redis.disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
