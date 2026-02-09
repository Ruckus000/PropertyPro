/**
 * Drizzle Kit configuration.
 *
 * AGENTS #4: Uses DIRECT_URL (direct connection, port 5432) for migrations only.
 * The pooled DATABASE_URL (port 6543) is used at runtime by the app.
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DIRECT_URL!,
  },
});
