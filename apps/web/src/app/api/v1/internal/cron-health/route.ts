/**
 * GET /api/v1/internal/cron-health
 *
 * 200 when every scheduled job has SUCCEEDED within its own staleness window;
 * 503 naming the ones that have not. Wired into the external uptime monitor.
 *
 * ## Why this exists when Sentry already has the failures
 *
 * Sentry cannot see a job that stops running. In 2026-08 all seventeen crons
 * returned 401 for months behind a green Vercel dashboard and produced ZERO
 * events — `requireCronSecret` throws `UnauthorizedError`, an `AppError`, and
 * `withErrorHandler` returns before Sentry capture for those. Registration is
 * not evidence: `vercel crons ls` listed every job as healthy the entire time.
 *
 * The sibling `revenue-snapshot/health` proves this works, for exactly one job
 * of seventeen. This generalises it to all of them off one table.
 *
 * ## What "not yet" means, and why it is not "missing"
 *
 * A job with no successful run is only stale once its OWN window has elapsed
 * since `first_observed_at` — the moment the heartbeat first knew about it. The
 * first version of this endpoint had no such notion and reported 503 for a
 * monthly job whose last real run predated the table, which would have held the
 * probe red until 2026-10-01 with nothing wrong. That matters beyond tidiness:
 * this endpoint's entire purpose is to be watched by an uptime monitor
 * (docs/LAUNCH-BLOCKERS.md item 5), and a monitor trained to ignore a red probe
 * is worse than no monitor at all.
 *
 * The grace is bounded and it expires. It applies ONLY to a job that has never
 * started; a job that has run and never succeeded is stale at once, because
 * there the evidence is not missing — we watched it fail.
 *
 * ## No auth, deliberately
 *
 * Health probes must be reachable by a monitor, which is the same justification
 * `revenue-snapshot/health` carries; both are listed in
 * `UNAUTHENTICATED_BY_DESIGN` in `scripts/verify-internal-cron-auth.ts`.
 *
 * The body is therefore restricted to job slugs and timestamps. It deliberately
 * does NOT return `last_error`, which can carry query text or table internals —
 * "is it fresh?" needs no error message, and an unauthenticated endpoint should
 * not be the place one leaks from.
 */
import { NextResponse } from 'next/server';

import { CRON_JOBS, CRON_JOB_SLUGS } from '@/lib/cron/registry';
import { listCronRuns } from '@/lib/services/cron-run-service';

interface JobHealth {
  job: string;
  last_succeeded_at: string | null;
  minutes_since: number | null;
  max_age_minutes: number;
  stale: boolean;
  /** Why it is stale — or, for `awaiting_first_run`, why it is not. */
  reason?: 'never_registered' | 'never_run' | 'never_succeeded' | 'overdue' | 'awaiting_first_run';
  /** Only on a job that has not run yet: how long we have been watching it. */
  observed_for_minutes?: number;
}

export async function GET() {
  const runs = await listCronRuns();
  const byslug = new Map(runs.map((r) => [r.jobSlug, r]));
  const now = Date.now();

  const jobs: JobHealth[] = CRON_JOB_SLUGS.map((slug) => {
    const definition = CRON_JOBS[slug];
    const base = { job: slug, max_age_minutes: definition.maxAgeMinutes };
    const run = byslug.get(slug);

    // No row at all. `withCronJob` registers every registry slug on a cold
    // start, so after a single tick of ANY job this state means the heartbeat
    // itself is not writing — a strictly worse problem than a late job, and
    // never something to report as healthy. Treating an absent row as fine is
    // precisely how the 2026-08 outage stayed invisible for months.
    if (!run) {
      return {
        ...base,
        last_succeeded_at: null,
        minutes_since: null,
        stale: true,
        reason: 'never_registered',
      };
    }

    /*
     * The success check comes FIRST, before the never-run branch below, so a
     * job that has genuinely succeeded is judged on that success no matter what
     * the other columns say. Ordering it the other way would let an
     * inconsistent row (a success with no recorded start) be reported as
     * awaiting its first run — silent, and wrong in the forgiving direction.
     */
    if (run.lastSucceededAt) {
      const minutesSince = (now - new Date(run.lastSucceededAt).getTime()) / 60_000;
      const stale = minutesSince > definition.maxAgeMinutes;
      return {
        ...base,
        last_succeeded_at: new Date(run.lastSucceededAt).toISOString(),
        minutes_since: Math.round(minutesSince),
        stale,
        ...(stale ? { reason: 'overdue' as const } : {}),
      };
    }

    /*
     * It RAN and has never succeeded. No grace, deliberately and unchanged: a
     * job that starts and dies is not alive in any sense the probe should
     * accept, and unlike the branch below there is no ambiguity to resolve —
     * we have watched it try and fail.
     */
    if (run.lastStartedAt) {
      return {
        ...base,
        last_succeeded_at: null,
        minutes_since: null,
        stale: true,
        reason: 'never_succeeded',
      };
    }

    /*
     * Registered, but never started — so we cannot yet tell "dead" from "not
     * due yet", and the honest answer depends on how long we have been able to
     * see it. The window is the job's OWN `maxAgeMinutes`, measured from
     * `first_observed_at`: exactly the tolerance every other job gets, applied
     * from the only defensible starting point.
     *
     * This branch exists because the probe got that wrong and reported 503 for
     * a healthy platform. `cron_runs` shipped 2026-09-06; `generate-assessments`
     * runs `0 5 1 * *`, so its last real run predated the table and its next was
     * 24 days out. Sixteen of seventeen jobs green, endpoint red — and a probe
     * that is red by construction is one nobody reads when it goes red for a
     * reason. It also recurs for every job added later, which is why this is a
     * stored fact and not a one-off constant.
     */
    const observedForMinutes = (now - new Date(run.firstObservedAt).getTime()) / 60_000;
    const stale = observedForMinutes > definition.maxAgeMinutes;
    return {
      ...base,
      last_succeeded_at: null,
      minutes_since: null,
      observed_for_minutes: Math.round(observedForMinutes),
      stale,
      // `never_run` once its window has passed and the grace has run out; the
      // distinct `awaiting_first_run` before that, so a 200 carrying a null
      // timestamp explains itself rather than looking like a bug in the probe.
      reason: stale ? ('never_run' as const) : ('awaiting_first_run' as const),
    };
  });

  const staleJobs = jobs.filter((j) => j.stale);

  return NextResponse.json(
    {
      status: staleJobs.length === 0 ? 'healthy' : 'unhealthy',
      checked_at: new Date(now).toISOString(),
      // Named up front so the monitor's alert text is directly actionable
      // rather than requiring someone to diff the full list.
      stale_jobs: staleJobs.map((j) => j.job),
      // Not stale, but not proven either. Surfaced so a green result with a
      // null timestamp in it is self-explaining.
      awaiting_first_run: jobs.filter((j) => j.reason === 'awaiting_first_run').map((j) => j.job),
      jobs,
    },
    { status: staleJobs.length === 0 ? 200 : 503 },
  );
}

// A freshness probe must never be cached — a cached 200 is the exact failure
// this endpoint exists to catch.
export const dynamic = 'force-dynamic';
