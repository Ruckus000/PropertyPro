/**
 * The heartbeat's own statements, against real Postgres.
 *
 * ## Why this is db-backed and not a unit test
 *
 * Every other test of this code mocks `cron-run-service`, which means the only
 * thing they can prove is that the wrapper calls the functions we wrote. That
 * is exactly the gap that let #1042 ship: the unit suite replaced `execute`
 * with a spy, so four fatal statements read as green for a day.
 *
 * The property below is worth a real driver because its failure is silent AND
 * unbounded. `registerCronJobs` uses `onConflictDoNothing`, and if that were an
 * upsert instead, `first_observed_at` would advance on every cold start — the
 * grace window would never expire, and a job that genuinely died would be
 * forgiven forever. The endpoint would report 200 through a total cron outage,
 * which is strictly worse than the false 503 this whole change set out to fix.
 * No mocked insert can tell those two statements apart.
 *
 * Nothing is mocked — no-mock-guard forbids it under __tests__/integration/,
 * and none of it is needed: the services are called directly.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

/*
 * `cron_runs` is platform-scoped — it has no `community_id`, so no scoped
 * client can address it. The reads below are this file's own assertions about
 * rows it just wrote.
 */
// AUTHZ: platform-scoped cron heartbeat; no tenant data is read or written.
import { createUnscopedClient } from '@propertypro/db/unsafe';

import { CRON_JOB_SLUGS } from '@/lib/cron/registry';
import {
  listCronRuns,
  recordCronRun,
  registerCronJobs,
} from '@/lib/services/cron-run-service';

import { getDescribeDb, requireDatabaseUrlInCI } from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Cron heartbeat integration tests');

const describeDb = getDescribeDb();

describeDb('cron heartbeat (db-backed integration)', () => {
  const db = createUnscopedClient();

  /**
   * `cron_runs` is platform-scoped and keyed by job slug, so there is no tenant
   * to isolate on and no run history to preserve — the table holds exactly one
   * row per job. Truncating between cases is therefore both safe and necessary:
   * these tests are about what a SECOND call does to a row the first created.
   */
  const clear = () => db.execute(sql`DELETE FROM cron_runs`);

  beforeEach(clear);
  afterAll(clear);

  it('registers a row per job that records observation, not a run', async () => {
    await registerCronJobs(CRON_JOB_SLUGS);

    const rows = await listCronRuns();
    expect(rows).toHaveLength(CRON_JOB_SLUGS.length);

    for (const row of rows) {
      // The honest shape 0070 made possible: known, not run. Under the old
      // NOT NULL DEFAULT now() column this row would have had to claim a start
      // that never happened — and the probe would read it as a live job.
      expect(row.lastStartedAt).toBeNull();
      expect(row.lastSucceededAt).toBeNull();
      expect(row.lastStatus).toBeNull();
      expect(row.firstObservedAt).toBeInstanceOf(Date);
    }
  });

  it('does NOT advance first_observed_at on a later call — the grace must expire', async () => {
    /*
     * THE LOAD-BEARING ASSERTION. Every cold start calls this, so an upsert
     * here would keep pushing the observation stamp forward and no job could
     * ever exhaust its window. Backdating past the longest window in the
     * registry (32 days) makes the failure unmistakable: if the stamp moved,
     * the job goes from "long overdue" to "just registered".
     */
    await registerCronJobs(CRON_JOB_SLUGS);
    const longAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    // ISO string, not a Date: postgres-js cannot serialise a bare Date as an
    // untyped bind parameter and throws client-side (#1042).
    await db.execute(sql`UPDATE cron_runs SET first_observed_at = ${longAgo.toISOString()}`);

    await registerCronJobs(CRON_JOB_SLUGS);

    const rows = await listCronRuns();
    expect(rows).toHaveLength(CRON_JOB_SLUGS.length);
    for (const row of rows) {
      expect(row.firstObservedAt.getTime()).toBe(longAgo.getTime());
    }
  });

  it('does NOT clobber a recorded run when the job is re-registered', async () => {
    // Registration runs on every cold start, and a cold start is far more
    // likely to land on a job that HAS run than one that has not.
    await registerCronJobs(CRON_JOB_SLUGS);
    const slug = CRON_JOB_SLUGS[0]!;
    const startedAt = new Date(Date.now() - 60_000);
    await recordCronRun(slug, { status: 'ok', startedAt, durationMs: 42 });

    await registerCronJobs(CRON_JOB_SLUGS);

    const row = (await listCronRuns()).find((r) => r.jobSlug === slug);
    expect(row?.lastSucceededAt).toBeInstanceOf(Date);
    expect(row?.lastStatus).toBe('ok');
    expect(row?.lastDurationMs).toBe(42);
  });

  it('keeps first_observed_at when the job finally runs', async () => {
    // The stamp answers "since when could we have seen this job?", which does
    // not change because the job succeeded once.
    await registerCronJobs(CRON_JOB_SLUGS);
    const slug = CRON_JOB_SLUGS[0]!;
    const before = (await listCronRuns()).find((r) => r.jobSlug === slug)!.firstObservedAt;

    await recordCronRun(slug, { status: 'ok', startedAt: new Date(), durationMs: 5 });

    const after = (await listCronRuns()).find((r) => r.jobSlug === slug)!;
    expect(after.firstObservedAt.getTime()).toBe(before.getTime());
    expect(after.lastStartedAt).toBeInstanceOf(Date);
  });

  it('records a run for a job that was never registered', async () => {
    /*
     * Registration happens in a `finally`, AFTER the heartbeat, so on the very
     * first tick of a fresh deploy `recordCronRun` inserts the row itself. That
     * path must still produce a usable row rather than failing on the new
     * column — if it did, the swallowing catch would hide it and the job would
     * look like it never ran.
     */
    const slug = CRON_JOB_SLUGS[0]!;
    await recordCronRun(slug, { status: 'error', startedAt: new Date(), durationMs: 7, error: 'nope' });

    const rows = await listCronRuns();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.firstObservedAt).toBeInstanceOf(Date);
    expect(rows[0]?.lastSucceededAt).toBeNull();
    expect(rows[0]?.consecutiveFailures).toBe(1);
  });
});
