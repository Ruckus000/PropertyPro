/**
 * cron_runs — one row per scheduled job, recording when it last ran.
 *
 * Platform-wide (not tenant-scoped), like `revenue_snapshots`. Written by
 * `withCronJob` on every AUTHENTICATED tick; read by
 * `/api/v1/internal/cron-health`. A tick that 401s writes nothing at all —
 * that was an unauthenticated write to a monitoring signal, and one `curl`
 * could pin the probe red for a month.
 *
 * ## Why this table exists
 *
 * Failure alerting cannot see a job that STOPS RUNNING. In 2026-08 all
 * seventeen crons returned 401 for months behind a green Vercel dashboard, and
 * that produced ZERO Sentry events — `requireCronSecret` throws
 * `UnauthorizedError`, an `AppError`, and `withErrorHandler` returns before
 * Sentry capture for those. Registration is not evidence: `vercel crons ls`
 * listed every job as healthy the entire time it was dead.
 *
 * So "did it run?" needs its own durable record, and freshness of that record
 * is the only signal that catches silence.
 *
 * ## Shape
 *
 * `job_slug` is the primary key: one row per job, upserted, bounded at one row
 * per slug ever registered — seventeen today. Nothing prunes a slug removed
 * from the registry, and the service takes a plain `string`, so "matches
 * CronJobSlug" below is a convention rather than a constraint. No history, deliberately — this answers "is the job
 * alive?", not "what did it do", and an unbounded run log would need retention
 * policy for a question nothing asks.
 *
 * A row means "the heartbeat knows about this job", NOT "this job has run".
 * `withCronJob` registers every slug in the registry on the first AUTHENTICATED
 * tick of a process, so a newly deployed job gets a row — and therefore a grace
 * window — before its own first tick, rather than reading as dead until it
 * happens to run. If every tick 401s, nothing registers and the probe reports
 * `never_registered` for all seventeen; see docs/runbooks/cron-alerting.md,
 * which is the `CRON_SECRET` shape rather than a broken heartbeat.
 */
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const cronRuns = pgTable('cron_runs', {
  /** Matches `CronJobSlug` in apps/web/src/lib/cron/registry.ts. */
  jobSlug: text('job_slug').primaryKey(),
  /**
   * When this job first became KNOWN to the heartbeat — not when it first ran.
   *
   * Without it, a job that has never run is indistinguishable from a job that
   * has stopped running, and the probe must assume the worse of the two. That
   * cost us a real month: `cron_runs` shipped 2026-09-06, `generate-assessments`
   * runs `0 5 1 * *`, and its last real run (2026-09-01) predated the table — so
   * the probe reported 503 for a job with no fault, and would have gone on doing
   * so until 2026-10-01. An endpoint that is red by construction is an endpoint
   * nobody reads.
   *
   * With this column the probe can ask the question it actually means: has the
   * job's OWN window elapsed since we started watching? Deliberately NOT called
   * `registered_at` — "registration is not evidence" is the lesson of the
   * 2026-08 outage, where `vercel crons ls` listed every dead job as healthy,
   * and reusing that word here would invite exactly the wrong reading.
   */
  firstObservedAt: timestamp('first_observed_at', { withTimezone: true }).notNull().defaultNow(),
  /**
   * Null until the job actually runs.
   *
   * Nullable so a registered-but-not-yet-run job can be recorded honestly. It
   * was NOT NULL DEFAULT now() originally, when a row could only be created by
   * a run; a placeholder row under that shape would have had to claim a start
   * that never happened, which is the kind of convenient lie a monitoring table
   * least needs.
   */
  lastStartedAt: timestamp('last_started_at', { withTimezone: true }),
  /**
   * Only ever advanced by a SUCCESSFUL run. The health probe reads this and
   * not `last_started_at`, because a job that starts and dies every tick is
   * not alive in any sense that matters.
   */
  lastSucceededAt: timestamp('last_succeeded_at', { withTimezone: true }),
  /** 'ok' | 'error' — the outcome of the most recent attempt. */
  lastStatus: text('last_status'),
  lastDurationMs: integer('last_duration_ms'),
  /**
   * A short reason for whoever reads this table, truncated by `withCronJob`.
   *
   * Deliberately NOT returned by `/api/v1/internal/cron-health`: that endpoint
   * is unauthenticated, and an error message can carry query text or table
   * internals. The probe answers "is it fresh?", which needs timestamps only.
   */
  lastError: text('last_error'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CronRun = typeof cronRuns.$inferSelect;
