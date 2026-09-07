/**
 * The cron heartbeat — durable evidence that a job actually ran.
 *
 * Failure alerting cannot see a job that STOPS RUNNING. In 2026-08 all
 * seventeen crons 401'd for months behind a green Vercel dashboard and produced
 * ZERO Sentry events, because `requireCronSecret` throws `UnauthorizedError` —
 * an `AppError` — and `withErrorHandler` returns before Sentry capture for
 * those. Registration is not evidence.
 *
 * So the run records itself, and `/api/v1/internal/cron-health` reads the
 * freshness of that record.
 */
/*
 * The heartbeat is deliberately CROSS-TENANT — `cron_runs` is platform-scoped
 * and has no `community_id` — so it cannot go through a community-scoped
 * client. Every statement below addresses one row by its primary key.
 */
// AUTHZ: platform-scoped cron heartbeat; no tenant data is read or written.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { cronRuns, type CronRun } from '@propertypro/db';
import { sql } from '@propertypro/db/filters';

export interface CronRunOutcome {
  status: 'ok' | 'error';
  durationMs: number;
  startedAt: Date;
  /** A short reason. Never raw driver text — see the schema docblock. */
  error?: string | null;
}

/**
 * Record one completed run.
 *
 * ONE upsert, not a start-write plus a finish-write: the busiest job runs every
 * five minutes, and a second round trip per tick buys nothing that
 * `startedAt` (captured in JS) does not already give us.
 *
 * `last_succeeded_at` advances only on success. A job that starts and dies
 * every tick is not alive in any sense the health probe should accept, so a
 * failed run leaves the previous success timestamp in place and lets the row
 * go stale — which is what surfaces a persistently-broken job.
 */
export async function recordCronRun(jobSlug: string, outcome: CronRunOutcome): Promise<void> {
  const db = createUnscopedClient();
  const ok = outcome.status === 'ok';
  const now = new Date();

  await db
    .insert(cronRuns)
    .values({
      jobSlug,
      lastStartedAt: outcome.startedAt,
      lastSucceededAt: ok ? now : null,
      lastStatus: outcome.status,
      lastDurationMs: outcome.durationMs,
      lastError: ok ? null : (outcome.error ?? 'unknown'),
      consecutiveFailures: ok ? 0 : 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: cronRuns.jobSlug,
      set: {
        lastStartedAt: outcome.startedAt,
        /*
         * A SELF-REFERENCE, not a plain assignment and not `excluded.` — inside
         * ON CONFLICT DO UPDATE, the table-qualified name is the row as it was
         * BEFORE this statement, so this preserves it. (It is not a COALESCE,
         * which is what this comment used to claim; the distinction matters to
         * anyone auditing the conflict semantics, because `excluded.` here would
         * write the incoming NULL and erase the timestamp.)
         *
         * Load-bearing: erasing the last success on a failure drops the job into
         * `never_succeeded`, and a single blip would read as a dead job. Covered
         * by a db-backed test, because a plain assignment renders identically
         * under a mocked driver.
         */
        lastSucceededAt: ok ? now : sql`${cronRuns.lastSucceededAt}`,
        lastStatus: outcome.status,
        lastDurationMs: outcome.durationMs,
        lastError: ok ? null : (outcome.error ?? 'unknown'),
        consecutiveFailures: ok ? 0 : sql`${cronRuns.consecutiveFailures} + 1`,
        updatedAt: now,
      },
    });
}

/**
 * Ensure a row exists for every job in the registry, without disturbing any row
 * that is already there.
 *
 * ## Why the heartbeat registers jobs it has not seen run
 *
 * The health probe has to distinguish "this job stopped running" from "this job
 * has not had a chance to run yet", and it cannot do that from an absent row —
 * absence looks identical in both cases, so it must assume the worse one. That
 * cost a real month of false alarm: `cron_runs` shipped 2026-09-06 and
 * `generate-assessments` runs monthly, so the probe reported 503 for a job with
 * nothing wrong with it, and would have until 2026-10-01.
 *
 * A registered row carries `first_observed_at`, which turns the unanswerable
 * question into an answerable one: has this job's own window elapsed since we
 * started watching?
 *
 * `onConflictDoNothing` is load-bearing, not defensive. An upsert here would
 * push `first_observed_at` forward on every call and the grace window would
 * never expire — a job that genuinely died would be forgiven forever, which is
 * the exact failure this whole table exists to prevent.
 */
export async function registerCronJobs(jobSlugs: readonly string[]): Promise<void> {
  if (jobSlugs.length === 0) return;
  const db = createUnscopedClient();

  await db
    .insert(cronRuns)
    .values(
      jobSlugs.map((jobSlug) => ({
        jobSlug,
        // Explicitly null: the job is known, not run. The column was made
        // nullable in 0070 precisely so this row does not have to invent a
        // start time.
        lastStartedAt: null,
      })),
    )
    .onConflictDoNothing({ target: cronRuns.jobSlug });
}

/** Every recorded job. Bounded at one row per registered cron. */
export async function listCronRuns(): Promise<CronRun[]> {
  const db = createUnscopedClient();
  return db.select().from(cronRuns);
}
