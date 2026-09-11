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
 * THE SECOND CEILING, measured in production on 2026-09-11. The block above is
 * about Postgres's own `max_connections` on a local stack. Production does not
 * hit that one — it hits SUPAVISOR's client limit first, and the app never sees
 * Postgres directly at all:
 *
 *   (EMAXCONN) max client connections reached, limit: 200
 *
 * `globalThis` de-duplicates pools within a process, i.e. within one lambda
 * INSTANCE. It does nothing across instances. So the arithmetic is
 * instances × max, and at the previous `max: 10` the whole production budget
 * was TWENTY concurrent instances. A signup during a post-deploy cold-start
 * fan-out was enough to exhaust it, and `confirm-verification` answered 500.
 *
 * `docs/audits/2026-08-03-e2e-inventory.md:126-128` predicted the opposite —
 * "Production sits behind Supabase's pooler, so this may never surface there".
 * That was a prediction rather than a measurement, so this refines it rather
 * than contradicting its findings.
 *
 * `max: 3`, not 10 and not 1. `DATABASE_URL` is port 6543 — Supavisor
 * TRANSACTION mode — so the pooler is already the pool and a large client-side
 * one is mostly redundant; but production runs on Fluid compute, where a single
 * instance serves concurrent invocations, so `max: 1` would serialize them.
 * Three gives roughly 66 instances against the same 200 ceiling.
 *
 * NOT MEASURABLE FROM SQL, which is why this comment carries the number instead
 * of a probe. The app connects to Supavisor; `pg_stat_activity` only shows
 * connections to POSTGRES, so it cannot see the count that breaks. (That is a
 * live trap: reading it during the incident showed a healthy 26 and meant
 * nothing.) The admin health probe goes over PostgREST and consumes no pooler
 * slots at all, so it stays green through total saturation.
 */
const POOL_MAX = 3;

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
    : postgres(databaseUrl, {
        prepare: false,
        max: POOL_MAX,
        /**
         * Release idle connections back to Supavisor between invocations.
         *
         * This was UNSET, which is postgres-js for "never idle out". A warm
         * lambda instance therefore held its connections open for as long as
         * the instance lived, not just while it was serving a request — so the
         * steady-state cost of an idle instance was the same as a busy one, and
         * `max` bounded only the peak. Against a transaction pooler that is
         * pure waste: reacquiring is cheap, holding is not.
         *
         * 20s is comfortably longer than a request and far shorter than an
         * instance's idle lifetime, so a burst keeps its connections and a
         * parked instance gives them back.
         */
        idle_timeout: 20,
        /**
         * MUST stay strictly below every route's `maxDuration`.
         *
         * postgres.js defaults this to 30 (postgres/src/index.js:453) and our
         * webhook routes default to 30 too — so on a connect hang the two
         * clocks are equal and the PLATFORM's wins, because it starts at t=0
         * while the connect only begins after request parsing. postgres.js can
         * never reject first, so the function is killed and Vercel answers 504.
         *
         * For the inbound-email webhook that is not merely a bad error page: a
         * 5xx is returned verbatim by Forward Email as a PERMANENT failure and
         * the message bounces, defeating the deferral the route is built on.
         * At 10s the driver always loses the race on purpose, the catch runs,
         * and the sender holds the mail.
         *
         * THIS BOUNDS THE CONNECT ONLY, and that is the whole of it. postgres.js
         * exposes no query or statement timeout, its pool queue (`max` above)
         * has no wait timeout, and nothing in this repo sets `statement_timeout`
         * or `lock_timeout`. So a saturated pool or a lock wait — a manual
         * ALTER TABLE or data repair holding a lock while mail arrives — can
         * still outrun the platform budget and produce the same 504, and the
         * same bounce. Closing that means a global statement_timeout, which
         * would break community-export-worker and the seed/export scripts on
         * this same shared client: a cure worse than the disease at this stage.
         */
        connect_timeout: 10,
      });

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
