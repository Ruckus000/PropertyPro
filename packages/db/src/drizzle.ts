/**
 * Drizzle ORM database connection.
 *
 * AGENTS #5: Uses postgres-js driver (NOT node-postgres / pg).
 * AGENTS #4: Uses DATABASE_URL (pooled, port 6543) for app queries.
 *            DIRECT_URL (port 5432) is used only for migrations via drizzle.config.ts.
 *
 * NOTE: This db instance is internal to the package.
 * It will be wrapped by a scoped query builder in P0-06.
 * Do NOT export from the package index.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL environment variable');
}

/**
 * postgres-js connection — pooled via Supavisor (port 6543).
 * prepare: false is required for Supavisor/PgBouncer transaction mode.
 */
const client = postgres(databaseUrl, { prepare: false });

/** Drizzle ORM instance with full schema for relational queries */
export const db = drizzle(client, { schema });

/**
 * Closes the shared postgres-js client.
 * Intended for long-running scripts that should exit cleanly after finishing.
 */
export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}
