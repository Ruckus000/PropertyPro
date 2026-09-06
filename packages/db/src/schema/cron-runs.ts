/**
 * cron_runs — one row per scheduled job, recording when it last ran.
 *
 * Platform-wide (not tenant-scoped), like `revenue_snapshots`. Written by
 * `withCronJob` on every tick; read by `/api/v1/internal/cron-health`.
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
 * `job_slug` is the primary key: one row per job, upserted, bounded at
 * seventeen rows forever. No history, deliberately — this answers "is the job
 * alive?", not "what did it do", and an unbounded run log would need retention
 * policy for a question nothing asks.
 */
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const cronRuns = pgTable('cron_runs', {
  /** Matches `CronJobSlug` in apps/web/src/lib/cron/registry.ts. */
  jobSlug: text('job_slug').primaryKey(),
  lastStartedAt: timestamp('last_started_at', { withTimezone: true }).notNull().defaultNow(),
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
