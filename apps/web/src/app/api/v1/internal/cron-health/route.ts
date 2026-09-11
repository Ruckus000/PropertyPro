/**
 * GET /api/v1/internal/cron-health
 *
 * 200 when every scheduled job has SUCCEEDED within its own staleness window;
 * 503 naming the ones that have not. Polled twice daily by
 * .github/workflows/production-health.yml — which claimed to be wired into an
 * external uptime monitor long before anything read it at all.
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
 * `revenue-snapshot/health` carries; both are listed in this root's
 * `exemptions` in `scripts/verify-internal-cron-auth.ts` (per-root since the
 * guard also scans apps/admin's internal prefix).
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
  /** Why it is stale — or, for the two `awaiting_*` values, why it is not. */
  reason?:
    | 'never_registered'
    | 'never_run'
    | 'never_succeeded'
    | 'overdue'
    | 'awaiting_first_run'
    | 'awaiting_first_success';
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

    /*
     * No row at all — never healthy, whatever the cause.
     *
     * `withCronJob` registers every registry slug on the first AUTHENTICATED
     * tick of a process. So the likeliest reading of this state is NOT a broken
     * heartbeat: it is that every tick is 401ing and registration is being
     * skipped on purpose, which is the 2026-08 outage shape exactly. Seventeen
     * of these at once means check `CRON_SECRET` before suspecting the table.
     * (The runbook said the opposite until this was corrected.)
     */
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
     * No success yet — whether or not it has tried. Both cases ask the SAME
     * question, so both get the same window: has enough time passed that this
     * job should have succeeded by now? With no success to measure from, the
     * only defensible origin is `first_observed_at`, the moment the heartbeat
     * could first have seen it.
     *
     * The started-but-never-succeeded case used to short-circuit to
     * `stale: true` with no window at all, defended as "we have watched it try
     * and fail". That is true of a job failing every tick and false of one that
     * failed once — and nothing counts ticks. So a single transient 500 on a
     * monthly job's FIRST EVER run pinned this endpoint at 503 until its next
     * scheduled run, up to 31 days later. That is the exact harm #1073
     * describes an anonymous caller inflicting; #1073 closed the anonymous path
     * and left this one, which needs no attacker.
     *
     * A slower failure signal is correct here rather than a regression. This
     * probe answers "is it alive". Sentry answers "did it fail" — immediately,
     * with a `job` tag, which is what #1047 exists for. Conflating the two is
     * what produced the no-grace rule, and it made the alive/dead answer wrong
     * to buy a failure answer that was already covered.
     *
     * Deliberately NOT thresholded on `consecutive_failures`: the window
     * already catches a frequently-failing job quickly (a five-minute job
     * exhausts its twenty-minute window in four ticks), and a threshold would
     * pin the probe red during a hand-replay, which is precisely when an
     * operator is working the problem.
     */
    const observedForMinutes = (now - new Date(run.firstObservedAt).getTime()) / 60_000;
    const stale = observedForMinutes > definition.maxAgeMinutes;
    const hasTried = run.lastStartedAt !== null;
    return {
      ...base,
      last_succeeded_at: null,
      minutes_since: null,
      observed_for_minutes: Math.round(observedForMinutes),
      stale,
      /*
       * Four labels over two facts — has it tried, and has its window passed —
       * so a 200 carrying a null timestamp explains itself rather than looking
       * like a bug in the probe, and a 503 says which kind of dead it is.
       */
      reason: stale
        ? hasTried
          ? ('never_succeeded' as const)
          : ('never_run' as const)
        : hasTried
          ? ('awaiting_first_success' as const)
          : ('awaiting_first_run' as const),
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
      /*
       * Not stale, but not proven either. Surfaced so a green result carrying a
       * null timestamp is self-explaining. Two arrays rather than one because
       * the states differ in a way an operator acts on: `awaiting_first_run`
       * has never fired, `awaiting_first_success` fired and failed and its
       * window has not yet elapsed — the second is worth looking at in Sentry
       * now, the first is not.
       */
      awaiting_first_run: jobs.filter((j) => j.reason === 'awaiting_first_run').map((j) => j.job),
      awaiting_first_success: jobs
        .filter((j) => j.reason === 'awaiting_first_success')
        .map((j) => j.job),
      jobs,
    },
    { status: staleJobs.length === 0 ? 200 : 503 },
  );
}

// A freshness probe must never be cached — a cached 200 is the exact failure
// this endpoint exists to catch.
export const dynamic = 'force-dynamic';
