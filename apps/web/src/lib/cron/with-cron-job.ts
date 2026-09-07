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

import { recordCronRun, registerCronJobs } from '@/lib/services/cron-run-service';

import { CRON_JOB_SLUGS, type CronJobSlug } from './registry';

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

/**
 * Per-process, and set only on SUCCESS.
 *
 * Registration is a reconciliation, not a write the job needs, so doing it once
 * per instance rather than once per tick keeps ~99% of these statements out of
 * the busiest five-minute job. Serverless instances are short-lived and every
 * deploy makes new ones, so a newly added job still gets its row within a cold
 * start — which is what matters, since the grace window it grants is measured
 * in hours or days.
 *
 * The flag is NOT set optimistically: if the write fails, the next tick in this
 * instance retries. Latching on a failure would leave the instance permanently
 * unable to register a job, and the symptom — a job stuck reporting stale — is
 * the one this code exists to remove.
 */
let jobsRegistered = false;

/**
 * ALWAYS swallowing, for the same reason as the heartbeat: monitoring that can
 * take down a cron is worse than no monitoring.
 */
async function ensureJobsRegistered(): Promise<void> {
  if (jobsRegistered) return;
  try {
    await registerCronJobs(CRON_JOB_SLUGS);
    jobsRegistered = true;
  } catch {
    // Deliberately silent — see the docblock.
  }
}

/** Test seam: lets a case exercise the first-tick path in a warm process. */
export function __resetJobRegistrationForTests(): void {
  jobsRegistered = false;
}

export function withCronJob(slug: CronJobSlug, handler: CronRouteHandler): CronRouteHandler {
  return async function cronJobHandler(req, ...rest) {
    return Sentry.withIsolationScope(async (scope) => {
      scope.setTag('job', slug);
      /*
       * Group by job as well as by signature.
       *
       * Every cron 500 funnels through the single `Sentry.captureException` in
       * error-handler.ts, so grouping is decided entirely by the error itself —
       * and drizzle reports failures as a uniform `Failed query: <SQL>`. Two
       * different jobs breaking the same way therefore land in ONE issue:
       * resolving or ignoring it silences the other, and the notification names
       * one job while two are down.
       *
       * `{{ default }}` keeps Sentry's normal grouping as a component and
       * appends the job, so each cron gets its own issue without flattening
       * distinct errors within a job into one. Set on the ISOLATION scope for
       * the same reason the tag is: it has to reach captures made deep in a
       * nested async service, which a `withScope` fork would not.
       *
       * This is the first fingerprint in the codebase — there was no existing
       * convention to follow, so this is the one to follow.
       */
      scope.setFingerprint(['{{ default }}', slug]);
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
      } finally {
        /*
         * In a `finally` so a job that throws still registers its siblings, and
         * AFTER the heartbeat so this can never delay the run's own record.
         *
         * Awaiting here defers the return or the rethrow but cannot change
         * either, because `ensureJobsRegistered` swallows everything — a
         * `finally` that threw would replace the handler's error with this
         * one, which is the only way this line could do damage.
         */
        await ensureJobsRegistered();
      }
    });
  };
}
