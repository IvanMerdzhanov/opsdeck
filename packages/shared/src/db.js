import pg from 'pg';

export function createDb({ connectionString = process.env.DATABASE_URL, logger } = {}) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  // An idle client losing its connection (DB restart, failover) emits 'error' on the pool.
  // Unhandled, that crashes the process. The pool discards the broken client and reconnects on demand.
  pool.on('error', (err) => logger?.warn({ err: err.message }, 'idle database connection lost'));
  return {
    query: (text, params) => pool.query(text, params),
    ping: async () => {
      await pool.query('SELECT 1');
    },
    close: () => pool.end(),
  };
}
