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
 *
 * CACHED ON `globalThis` — this is not a micro-optimisation, it is a leak fix.
 *
 * A module-level `const` is one pool per MODULE INSTANCE, not one per process.
 * `next dev` compiles routes on demand and re-evaluates the module graph, so a
 * long dev session builds up several instances of this module — each opening a
 * fresh postgres-js pool (default `max: 10`) and never closing the previous
 * one. Connections therefore climb monotonically for as long as the server is
 * up.
 *
 * Measured on 2026-08-05 during a `--workers=1` e2e run against a local
 * Supabase stack (`max_connections = 100`): the app's idle `postgres.js`
 * connections rose past 60 while still climbing, and Postgres began refusing
 * new ones with
 *
 *   FATAL: remaining connection slots are reserved for roles with the
 *   SUPERUSER attribute (SQLSTATE 53300)
 *
 * GoTrue was one of the things refused, which is what surfaced as the
 * long-unexplained intermittent `/dev/agent-login` 500 ("Database error
 * finding user") partway through an e2e run — it broke later in a run because
 * that is when the slots ran out.
 *
 * `max` is stated explicitly rather than left implicit. It is postgres-js's own
 * default, so this changes no behaviour — it just makes the per-pool ceiling
 * visible next to the arithmetic above, since pools × max is what exhausts the
 * server.
 */
const POOL_MAX = 10;

const globalForDb = globalThis as unknown as {
  __propertyproPgClient?: { url: string; client: ReturnType<typeof postgres> };
};

// KEYED ON THE URL, not just cached. A bare cache would hand a pool built for
// one `DATABASE_URL` to a later module instance that read a different one, and
// the queries would silently go to the first database while the code believed
// it had switched. In this repo that failure mode is not hypothetical: the
// local/production URL split is the whole reason `with-env-local-demo-db.sh`
// exists, and integration tests have leaked into production before. Reuse the
// pool only when the URL still matches.
const cached = globalForDb.__propertyproPgClient;

const client =
  cached?.url === databaseUrl
    ? cached.client
    : postgres(databaseUrl, { prepare: false, max: POOL_MAX });

// Cache in every environment. Production re-evaluates this module rarely, but
// serverless cold starts and script re-imports benefit from the same guard, and
// an un-cached second pool is never what we want.
globalForDb.__propertyproPgClient = { url: databaseUrl, client };

/** Drizzle ORM instance with full schema for relational queries */
export const db = drizzle(client, { schema });

/**
 * Closes the shared postgres-js client.
 * Intended for long-running scripts that should exit cleanly after finishing.
 */
export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
  // Evict the cache so the NEXT module instance builds a live pool instead of
  // adopting this dead one.
  //
  // This does not revive the current instance: `db` above closed over `client`,
  // and re-importing the same specifier in this process returns the cached
  // module, so `client` is never re-evaluated. Callers are CLI scripts that
  // close on the way out, which is the only supported use. Note the pool is now
  // shared via `globalThis`, so calling this while another instance is still
  // querying would end that instance's pool too.
  delete globalForDb.__propertyproPgClient;
}
