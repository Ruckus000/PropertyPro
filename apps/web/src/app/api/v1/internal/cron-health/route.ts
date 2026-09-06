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
  /** Why it is stale, when it is. */
  reason?: 'never_run' | 'never_succeeded' | 'overdue';
}

export async function GET() {
  const runs = await listCronRuns();
  const byslug = new Map(runs.map((r) => [r.jobSlug, r]));
  const now = Date.now();

  const jobs: JobHealth[] = CRON_JOB_SLUGS.map((slug) => {
    const definition = CRON_JOBS[slug];
    const run = byslug.get(slug);

    // A job with no row at all has never run since the heartbeat shipped.
    // Reported as stale rather than unknown: "we have no evidence it ran" is
    // the same operational state as "it did not run", and treating an absent
    // row as healthy is precisely how the 2026-08 outage stayed invisible.
    if (!run) {
      return {
        job: slug,
        last_succeeded_at: null,
        minutes_since: null,
        max_age_minutes: definition.maxAgeMinutes,
        stale: true,
        reason: 'never_run',
      };
    }
    if (!run.lastSucceededAt) {
      return {
        job: slug,
        last_succeeded_at: null,
        minutes_since: null,
        max_age_minutes: definition.maxAgeMinutes,
        stale: true,
        reason: 'never_succeeded',
      };
    }

    const minutesSince = (now - new Date(run.lastSucceededAt).getTime()) / 60_000;
    const stale = minutesSince > definition.maxAgeMinutes;
    return {
      job: slug,
      last_succeeded_at: new Date(run.lastSucceededAt).toISOString(),
      minutes_since: Math.round(minutesSince),
      max_age_minutes: definition.maxAgeMinutes,
      stale,
      ...(stale ? { reason: 'overdue' as const } : {}),
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
      jobs,
    },
    { status: staleJobs.length === 0 ? 200 : 503 },
  );
}

// A freshness probe must never be cached — a cached 200 is the exact failure
// this endpoint exists to catch.
export const dynamic = 'force-dynamic';
