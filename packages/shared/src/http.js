export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Liveness (/health) says the process is up; readiness (/ready) says its dependencies are reachable.
export function mountProbes(app, { db, redis, logger }) {
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', async (_req, res) => {
    try {
      await db.ping();
      if (redis) await redis.ping();
      res.json({ status: 'ready' });
    } catch (err) {
      logger?.warn({ err }, 'readiness check failed');
      res.status(503).json({ status: 'not_ready' });
    }
  });
}

const PG_ERRORS = {
  '23505': [409, 'conflict'], // unique_violation
  '23503': [409, 'reference_conflict'], // foreign_key_violation
  '22P02': [400, 'invalid_identifier'], // invalid_text_representation (e.g. bad uuid)
};

export function errorHandler(logger) {
  return (err, req, res, _next) => {
    const [pgStatus, pgMessage] = PG_ERRORS[err.code] ?? [];
    const status = err.status ?? pgStatus ?? 500;
    const expected = err instanceof HttpError || pgStatus || err.expose; // expose: e.g. malformed JSON body
    if (!expected) logger.error({ err, path: req.path }, 'request failed');
    res.status(status).json({
      // Never leak internals of unexpected errors; intentional HttpErrors carry a safe message.
      error: expected ? (pgMessage ?? err.message) : 'internal_error',
      ...(err.details && { details: err.details }),
    });
  };
}
