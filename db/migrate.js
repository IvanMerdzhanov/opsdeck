// CLI entrypoint: node db/migrate.js  (uses DATABASE_URL)
import { migrate } from './migrations.js';

await migrate();
