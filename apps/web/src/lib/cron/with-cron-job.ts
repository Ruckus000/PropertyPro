/**
 * Stamps a cron route's identity onto every Sentry event it produces.
 *
 * ## The gap this closes
 *
 * `/api/v1/internal/scheduled-site-publish` returned 500 on all ~96 daily runs
 * for a full day (#1042). Sentry captured every one. Nobody was told — and
 * nobody *could* have been, because `withErrorHandler` stamps only
 * `request_id` (a per-request UUID) and `app: web`. There was no attribute
 * identifying WHICH job failed, so there was no Sentry alert rule anyone could
 * have written, even looking for exactly this.
 *
 * With a `job` tag, one rule — "a new issue where the `job` tag is set" —
 * covers all seventeen jobs at once.
 *
 * ## Why an ISOLATION scope, not `withScope`
 *
 * `withErrorHandler` captures inside its own `Sentry.withScope(...)` fork, and
 * services capture inside theirs. A tag set on a forked *current* scope does
 * not reach a sibling fork, so `withScope` here would tag nothing that matters.
 * Tags on the ISOLATION scope merge into every event captured anywhere in the
 * async context beneath it.
 *
 * Measured, not assumed (2026-09-05, @sentry/nextjs 10.38.0):
 *
 *   isolation outside + withScope/capture inside → tags {job, request_id}
 *   isolation outside + bare capture in a nested async service → tags {job}
 *   INVERTED (isolation inside, capture outside)  → tags {}
 *
 * ## Why the wrapper must be OUTERMOST
 *
 * `withCronJob(slug, withErrorHandler(fn))` — never the reverse. Inverted, the
 * throw escapes the isolation scope before `withErrorHandler` captures it and
 * the tag is silently absent (row three above): the job looks instrumented,
 * the alert rule matches nothing, and the failure is invisible exactly as it
 * was before. That is this outage's own defect class restored in a form that
 * reads as correct, so it is enforced by `pnpm guard:cron-job-tagging` and
 * probed by a test, not left to a comment.
 */
import type { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { recordCronRun } from '@/lib/services/cron-run-service';

import type { CronJobSlug } from './registry';

/**
 * Next route handlers vary in arity (some take a params context, none of the
 * cron routes do). Typed loosely so the wrapper never constrains a handler
 * signature it only passes through.
 */
type CronRouteHandler = (req: NextRequest, ...rest: never[]) => Promise<Response>;

/**
 * Keys whose value means "some of this run's work failed".
 *
 * An explicit allowlist rather than "any key containing 'fail'", so a field
 * added later cannot silently start paging somebody at 4am. Numeric keys are
 * read as counts; array keys as lengths.
 *
 * This exists because HTTP status is not a reliable signal here. Several jobs
 * catch their own errors and return 200 with the failures in the body —
 * `account-lifecycle` pushes into `summary.errors`, the export worker counts
 * `failed`, the digest processor counts `rowsFailed`. `console.error` is not a
 * Sentry signal (there is no `captureConsoleIntegration` in
 * `sentry.server.config.ts`), so before this those counters were visible only
 * in Vercel logs nobody tails.
 */
const NUMERIC_FAILURE_KEYS = ['failed', 'rowsFailed', 'failedCount'] as const;
const ARRAY_FAILURE_KEYS = ['errors', 'failures'] as const;

export interface FailureSignal {
  key: string;
  count: number;
}

/** Walks a parsed summary for failure counters. Exported for tests. */
export function collectFailureSignals(value: unknown, depth = 0): FailureSignal[] {
  // Cron summaries are shallow; the bound stops a pathological or cyclic body
  // from turning telemetry into a hang.
  if (depth > 6 || value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((v) => collectFailureSignals(v, depth + 1));

  const signals: FailureSignal[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (NUMERIC_FAILURE_KEYS.includes(key as (typeof NUMERIC_FAILURE_KEYS)[number])) {
      if (typeof child === 'number' && child > 0) signals.push({ key, count: child });
      continue;
    }
    if (ARRAY_FAILURE_KEYS.includes(key as (typeof ARRAY_FAILURE_KEYS)[number])) {
      if (Array.isArray(child) && child.length > 0) signals.push({ key, count: child.length });
      continue;
    }
    signals.push(...collectFailureSignals(child, depth + 1));
  }
  return signals;
}

/**
 * Report failures the response body admits to but the status code hides.
 *
 * Everything here is best-effort and swallowing: a body that is not JSON, or a
 * read that fails, yields no signals and stays SILENT rather than alarming.
 * Telemetry must never be able to turn a working cron into a broken one — that
 * would make the monitoring the outage.
 */
async function reportSummaryFailures(slug: CronJobSlug, res: Response): Promise<void> {
  try {
    if (!res.headers.get('content-type')?.includes('application/json')) return;
    const body: unknown = await res.clone().json();
    const signals = collectFailureSignals(body);
    if (signals.length === 0) return;

    Sentry.captureMessage('cron_job_reported_failures', {
      level: 'error',
      extra: {
        job: slug,
        signals,
        total: signals.reduce((sum, s) => sum + s.count, 0),
        summary: body,
      },
    });
  } catch {
    // Deliberately silent — see the docblock.
  }
}

/** Longest stored failure reason. Enough to triage, short enough not to be a log. */
const MAX_ERROR_CHARS = 300;

/**
 * Record that the job ran, and how it went.
 *
 * ALWAYS swallowing. A failure to record a run must never change the response
 * or fail the job — monitoring that can cause an outage is worse than no
 * monitoring, and this is the code most likely to be running while the database
 * is already unhappy.
 */
async function recordHeartbeat(
  slug: CronJobSlug,
  startedAt: Date,
  status: 'ok' | 'error',
  error?: unknown,
): Promise<void> {
  try {
    await recordCronRun(slug, {
      status,
      startedAt,
      durationMs: Date.now() - startedAt.getTime(),
      error:
        status === 'ok'
          ? null
          : (error instanceof Error ? error.message : String(error ?? 'unknown')).slice(
              0,
              MAX_ERROR_CHARS,
            ),
    });
  } catch {
    // Deliberately silent — see the docblock.
  }
}

export function withCronJob(slug: CronJobSlug, handler: CronRouteHandler): CronRouteHandler {
  return async function cronJobHandler(req, ...rest) {
    return Sentry.withIsolationScope(async (scope) => {
      scope.setTag('job', slug);
      const startedAt = new Date();

      try {
        const res = await handler(req, ...rest);
        // Inside the isolation scope, so the event carries the `job` tag and the
        // one alert rule matches it exactly as it matches a 500.
        await reportSummaryFailures(slug, res);
        /*
         * A non-2xx is NOT a success, and 401 in particular matters: the
         * 2026-08 outage was every cron returning 401 for months, which throws
         * `UnauthorizedError` — an `AppError` — and so never reaches Sentry at
         * all. Recording it as a failed run is what lets the health probe see
         * that class of outage, since `last_succeeded_at` then goes stale.
         */
        await recordHeartbeat(
          slug,
          startedAt,
          res.ok ? 'ok' : 'error',
          res.ok ? undefined : `HTTP ${res.status}`,
        );
        return res;
      } catch (error) {
        await recordHeartbeat(slug, startedAt, 'error', error);
        throw error;
      }
    });
  };
}
