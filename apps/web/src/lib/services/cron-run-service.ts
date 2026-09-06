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
        // COALESCE, not a plain assignment: a failed run must not erase the
        // last known good timestamp, or a single blip would read as "never ran".
        lastSucceededAt: ok ? now : sql`${cronRuns.lastSucceededAt}`,
        lastStatus: outcome.status,
        lastDurationMs: outcome.durationMs,
        lastError: ok ? null : (outcome.error ?? 'unknown'),
        consecutiveFailures: ok ? 0 : sql`${cronRuns.consecutiveFailures} + 1`,
        updatedAt: now,
      },
    });
}

/** Every recorded job. Bounded at one row per registered cron. */
export async function listCronRuns(): Promise<CronRun[]> {
  const db = createUnscopedClient();
  return db.select().from(cronRuns);
}
