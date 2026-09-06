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

import type { CronJobSlug } from './registry';

/**
 * Next route handlers vary in arity (some take a params context, none of the
 * cron routes do). Typed loosely so the wrapper never constrains a handler
 * signature it only passes through.
 */
type CronRouteHandler = (req: NextRequest, ...rest: never[]) => Promise<Response>;

export function withCronJob(slug: CronJobSlug, handler: CronRouteHandler): CronRouteHandler {
  return async function cronJobHandler(req, ...rest) {
    return Sentry.withIsolationScope(async (scope) => {
      scope.setTag('job', slug);
      return handler(req, ...rest);
    });
  };
}
