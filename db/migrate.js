// Applies db/migrations/*.sql in filename order, once each, inside a transaction.
// Run: node db/migrate.js  (uses DATABASE_URL)
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const dir = path.join(import.meta.dirname, 'migrations');

// Seeds can reference {{VAR}} placeholders, filled from the environment (as SQL string literals).
const DEFAULTS = { DEMO_TARGET_URL: 'http://demo-target:4000/health' };
const render = (sql) =>
  sql.replace(/'\{\{(\w+)\}\}'/g, (_, name) => {
    const value = process.env[name] ?? DEFAULTS[name];
    if (value === undefined) throw new Error(`missing env var ${name} required by a migration`);
    return `'${value.replaceAll("'", "''")}'`;
  });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  // Serialise concurrent runs (e.g. several replicas starting at once).
  await client.query('SELECT pg_advisory_lock(727274)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const { rows } = await client.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = render(await readFile(path.join(dir, file), 'utf8'));
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${file} failed: ${err.message}`);
    }
  }
  console.log('migrations up to date');
} finally {
  await client.end();
}
