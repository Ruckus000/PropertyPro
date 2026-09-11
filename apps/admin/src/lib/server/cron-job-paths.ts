/**
 * Slug → the web app's internal path, for the Health board's one-click retry.
 *
 * ## The bug this exists to fix
 *
 * The retry route built its target as `${origin}/api/v1/internal/${slug}`, which
 * is correct for 16 of the 17 registered cron jobs and wrong for one.
 * `apps/web/src/lib/cron/registry.ts` defines the slug as "the path after
 * `/api/v1/internal/`, with `/` replaced by `-`" — and one job is NESTED:
 * `notification-digests-process` lives at
 * `/api/v1/internal/notification-digests/process`. The `-` is not reversible, so
 * reconstruction cannot recover it, and the retry POSTed to a path that does not
 * exist and got a 404.
 *
 * That slug is genuinely reachable from the console: `withCronJob` calls
 * `registerCronJobs(CRON_JOB_SLUGS)`, which inserts a `cron_runs` row for every
 * registry slug, so `listKnownJobSlugs()` returns it and every cron row is
 * `retryable`. The button rendered and could never work.
 *
 * ## Why a map here rather than an import
 *
 * `apps/admin` cannot import from `apps/web` — they are separate Next apps with
 * separate tsconfigs and separate deployments. So the derivation stays, and the
 * EXCEPTIONS are written down. Drift is the obvious hazard of that, and it is
 * closed rather than hoped about: `pnpm guard:cron-job-tagging` already imports
 * the registry and now asserts that this file reproduces every registry path
 * exactly, in both directions. A new nested job that is not listed here fails
 * the guard instead of shipping a 404 behind a button.
 *
 * @module lib/server/cron-job-paths
 */

/**
 * Slugs whose path is NOT `slug` with `-` left alone.
 *
 * One entry today. Keep it keyed by slug and valued by the path SEGMENT (no
 * leading slash, no `/api/v1/internal/` prefix) so the guard can compare it
 * against the registry's full path with one concatenation.
 */
export const NESTED_CRON_JOB_PATHS: Record<string, string> = {
  'notification-digests-process': 'notification-digests/process',
};

/** The prefix every internal cron endpoint shares. */
export const INTERNAL_CRON_PATH_PREFIX = '/api/v1/internal/';

/**
 * The internal path a slug names.
 *
 * Returns the path WITHOUT an origin, so the caller decides what it is fetched
 * against. The slug is expected to have passed the route's shape check and its
 * `listKnownJobSlugs()` membership test already — this function does not
 * validate, it translates.
 */
export function internalPathForCronSlug(slug: string): string {
  return `${INTERNAL_CRON_PATH_PREFIX}${NESTED_CRON_JOB_PATHS[slug] ?? slug}`;
}
