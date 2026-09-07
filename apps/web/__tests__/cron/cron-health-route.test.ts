import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The cron freshness probe.
 *
 * This endpoint is the ONLY thing that can detect a job which stopped running.
 * Sentry cannot: the 2026-08 outage was all seventeen crons returning 401 for
 * months, and `requireCronSecret` throws `UnauthorizedError` — an `AppError` —
 * which `withErrorHandler` returns for BEFORE Sentry capture. Zero events, green
 * dashboard, dead platform.
 *
 * So the cases that matter most here are the ones asserting 503: a probe that
 * reports healthy when a job is missing is worse than no probe, because it
 * converts an outage into a green tick.
 */
const { listCronRunsMock } = vi.hoisted(() => ({ listCronRunsMock: vi.fn() }));
vi.mock('@/lib/services/cron-run-service', () => ({ listCronRuns: listCronRunsMock }));

import type { CronRun } from '@propertypro/db';

import { GET } from '../../src/app/api/v1/internal/cron-health/route';
import { CRON_JOBS, CRON_JOB_SLUGS } from '../../src/lib/cron/registry';

/**
 * A row for every registered job, all succeeded a minute ago.
 *
 * Annotated with the REAL `CronRun` row type rather than left to inference.
 * Inference would narrow `lastSucceededAt` to `Date` and `lastError` to `null`
 * from these initial values, so the cases below that set them to null / a
 * string would not type-check — and, more to the point, the fixture would stop
 * being provably shaped like a row the query can actually return.
 */
const allFresh = (): CronRun[] =>
  CRON_JOB_SLUGS.map((slug) => ({
    jobSlug: slug,
    // Long enough ago that no case below is accidentally inside a grace
    // window: a fixture observed "a minute ago" would make every never-run
    // assertion pass for the wrong reason.
    firstObservedAt: new Date(Date.now() - 400 * 24 * 60 * 60_000),
    lastStartedAt: new Date(Date.now() - 60_000),
    lastSucceededAt: new Date(Date.now() - 60_000),
    lastStatus: 'ok',
    lastDurationMs: 120,
    lastError: null,
    consecutiveFailures: 0,
    updatedAt: new Date(),
  }));

/** A registered job that has never started — the shape 0070 exists for. */
const registeredNeverRun = (slug: string, observedMinutesAgo: number): CronRun => ({
  jobSlug: slug,
  firstObservedAt: new Date(Date.now() - observedMinutesAgo * 60_000),
  lastStartedAt: null,
  lastSucceededAt: null,
  lastStatus: null,
  lastDurationMs: null,
  lastError: null,
  consecutiveFailures: 0,
  updatedAt: new Date(),
});

interface Body {
  status: string;
  stale_jobs: string[];
  awaiting_first_run: string[];
  jobs: Array<{
    job: string;
    stale: boolean;
    reason?: string;
    minutes_since: number | null;
    observed_for_minutes?: number;
  }>;
}

describe('cron-health probe', () => {
  beforeEach(() => {
    // resetAllMocks, not clearAllMocks: the latter clears the call log but KEEPS
    // the implementation, so a case that forgot to set its own data would run
    // silently against the previous case's rows. Two of these tests passed
    // vacuously that way before this line changed.
    vi.resetAllMocks();
  });

  it('returns 200 when every job has succeeded inside its window', async () => {
    listCronRunsMock.mockResolvedValue(allFresh());

    const res = await GET();
    const body = (await res.json()) as Body;

    expect(res.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.stale_jobs).toEqual([]);
    expect(body.jobs).toHaveLength(CRON_JOB_SLUGS.length);
  });

  it('returns 503 naming the job that is overdue', async () => {
    const rows = allFresh();
    const target = 'scheduled-site-publish';
    const overdueBy = (CRON_JOBS[target].maxAgeMinutes + 10) * 60_000;
    const row = rows.find((r) => r.jobSlug === target)!;
    row.lastSucceededAt = new Date(Date.now() - overdueBy);
    listCronRunsMock.mockResolvedValue(rows);

    const res = await GET();
    const body = (await res.json()) as Body;

    expect(res.status).toBe(503);
    expect(body.status).toBe('unhealthy');
    expect(body.stale_jobs).toEqual([target]);
    expect(body.jobs.find((j) => j.job === target)?.reason).toBe('overdue');
  });

  it('returns 503 for a job with NO row — absent evidence is not health', async () => {
    /*
     * The 2026-08 shape. Treating a missing row as healthy is exactly how that
     * outage stayed invisible for months.
     *
     * Since 0070 this reports `never_registered` rather than `never_run`, and
     * the distinction carries information: `withCronJob` registers every
     * registry slug on a cold start, so after one tick of ANY job a missing row
     * means the heartbeat itself is not writing — a worse fault than a late
     * job, and one no grace window should ever soften.
     */
    listCronRunsMock.mockResolvedValue(
      allFresh().filter((r) => r.jobSlug !== 'visitor-auto-checkout'),
    );

    const res = await GET();
    const body = (await res.json()) as Body;

    expect(res.status).toBe(503);
    expect(body.stale_jobs).toEqual(['visitor-auto-checkout']);
    expect(body.jobs.find((j) => j.job === 'visitor-auto-checkout')?.reason).toBe(
      'never_registered',
    );
  });

  it('returns 503 for a job that has run but NEVER succeeded', async () => {
    // Runs every tick and fails every tick: `last_started_at` moves, so a probe
    // reading THAT would report healthy forever. This reads last_succeeded_at.
    const rows = allFresh();
    const row = rows.find((r) => r.jobSlug === 'community-export-worker')!;
    row.lastSucceededAt = null;
    row.lastStatus = 'error';
    row.lastStartedAt = new Date();
    listCronRunsMock.mockResolvedValue(rows);

    const res = await GET();
    const body = (await res.json()) as Body;

    expect(res.status).toBe(503);
    expect(body.jobs.find((j) => j.job === 'community-export-worker')?.reason).toBe(
      'never_succeeded',
    );
  });

  it('returns 503 with every job listed when the table is empty', async () => {
    listCronRunsMock.mockResolvedValue([]);

    const res = await GET();
    const body = (await res.json()) as Body;

    expect(res.status).toBe(503);
    expect(body.stale_jobs).toHaveLength(CRON_JOB_SLUGS.length);
  });

  it('respects each job’s own window rather than one global threshold', async () => {
    // A daily job an hour late is fine; the 15-minute job an hour late is not.
    // A single global threshold would get one of these wrong by construction.
    const rows = allFresh();
    const anHourAgo = new Date(Date.now() - 60 * 60_000);
    rows.find((r) => r.jobSlug === 'account-lifecycle')!.lastSucceededAt = anHourAgo;
    rows.find((r) => r.jobSlug === 'calendar-event-reminders')!.lastSucceededAt = anHourAgo;
    listCronRunsMock.mockResolvedValue(rows);

    const res = await GET();
    const body = (await res.json()) as Body;

    expect(res.status).toBe(503);
    expect(body.stale_jobs).toEqual(['calendar-event-reminders']);
  });

  it('never exposes last_error — the endpoint is unauthenticated', async () => {
    // An error message can carry query text or table internals. "Is it fresh?"
    // needs timestamps only.
    const rows = allFresh();
    rows[0]!.lastError = 'Failed query: SELECT secret FROM users WHERE ...';
    listCronRunsMock.mockResolvedValue(rows);

    const res = await GET();
    const raw = JSON.stringify(await res.json());

    expect(raw).not.toContain('Failed query');
    expect(raw).not.toContain('last_error');
  });

  /**
   * The grace window (migration 0070).
   *
   * These exist because the probe answered a question it could not actually
   * answer. `cron_runs` shipped 2026-09-06; `generate-assessments` runs
   * `0 5 1 * *`, so its last real run predated the table and its next was 24
   * days out — sixteen of seventeen jobs green and the endpoint 503, with
   * nothing wrong. The uptime monitor this endpoint exists for could not have
   * been pointed at it, and a probe held red for a month is one nobody believes
   * when it finally goes red for a reason.
   *
   * The pair that matters is "graced" and "grace expired". Either alone is
   * vacuous: the first would pass against a probe that never reports anything
   * stale, and the second against the old code that had no grace at all.
   */
  describe('a job registered but not yet run', () => {
    const MONTHLY_JOB = 'generate-assessments';

    it('is healthy while inside its own window — the production regression', async () => {
      const rows = allFresh().filter((r) => r.jobSlug !== MONTHLY_JOB);
      // Registered a day ago; its window is 32 days.
      rows.push(registeredNeverRun(MONTHLY_JOB, 24 * 60));
      listCronRunsMock.mockResolvedValue(rows);

      const res = await GET();
      const body = (await res.json()) as Body;

      expect(res.status).toBe(200);
      expect(body.status).toBe('healthy');
      expect(body.stale_jobs).toEqual([]);
      // Surfaced rather than hidden: a green body carrying a null timestamp
      // has to say why, or the next reader files it as a bug in the probe.
      expect(body.awaiting_first_run).toEqual([MONTHLY_JOB]);
      const job = body.jobs.find((j) => j.job === MONTHLY_JOB);
      expect(job?.reason).toBe('awaiting_first_run');
      expect(job?.observed_for_minutes).toBe(24 * 60);
    });

    it('goes stale once that window passes — the grace is bounded', async () => {
      const rows = allFresh().filter((r) => r.jobSlug !== MONTHLY_JOB);
      rows.push(registeredNeverRun(MONTHLY_JOB, CRON_JOBS[MONTHLY_JOB].maxAgeMinutes + 10));
      listCronRunsMock.mockResolvedValue(rows);

      const res = await GET();
      const body = (await res.json()) as Body;

      expect(res.status).toBe(503);
      expect(body.stale_jobs).toEqual([MONTHLY_JOB]);
      expect(body.awaiting_first_run).toEqual([]);
      expect(body.jobs.find((j) => j.job === MONTHLY_JOB)?.reason).toBe('never_run');
    });

    it('measures that window per job, not globally', async () => {
      /*
       * Both registered at the same moment and neither has run. The five-minute
       * job is long overdue; the monthly one is not due for weeks. A single
       * global grace threshold gets one of these wrong whichever value it picks,
       * which is the same argument the overdue path already makes.
       */
      const observedMinutesAgo = 60;
      const rows = allFresh().filter(
        (r) => r.jobSlug !== MONTHLY_JOB && r.jobSlug !== 'community-export-worker',
      );
      rows.push(registeredNeverRun(MONTHLY_JOB, observedMinutesAgo));
      rows.push(registeredNeverRun('community-export-worker', observedMinutesAgo));
      listCronRunsMock.mockResolvedValue(rows);

      const res = await GET();
      const body = (await res.json()) as Body;

      expect(res.status).toBe(503);
      expect(body.stale_jobs).toEqual(['community-export-worker']);
      expect(body.awaiting_first_run).toEqual([MONTHLY_JOB]);
    });

    it('does not let a grace window hide a genuinely overdue sibling', async () => {
      // The failure mode of adding tolerance: quieting the thing it was not
      // meant to quiet.
      const rows = allFresh().filter((r) => r.jobSlug !== MONTHLY_JOB);
      rows.push(registeredNeverRun(MONTHLY_JOB, 24 * 60));
      const late = rows.find((r) => r.jobSlug === 'scheduled-site-publish')!;
      late.lastSucceededAt = new Date(
        Date.now() - (CRON_JOBS['scheduled-site-publish'].maxAgeMinutes + 10) * 60_000,
      );
      listCronRunsMock.mockResolvedValue(rows);

      const res = await GET();
      const body = (await res.json()) as Body;

      expect(res.status).toBe(503);
      expect(body.stale_jobs).toEqual(['scheduled-site-publish']);
      expect(body.awaiting_first_run).toEqual([MONTHLY_JOB]);
    });
  });
});
