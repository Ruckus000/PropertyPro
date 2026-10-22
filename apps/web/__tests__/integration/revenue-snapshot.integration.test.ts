/**
 * The revenue-snapshot cron's SQL, against real Postgres.
 *
 * Every other test of this job mocks `revenue-snapshot-data-service`, so none of
 * them can see the three statements whose answers decide what an operator reads:
 *
 *   1. which row is "the latest" when a day has more than one (the table is
 *      append-only, and re-running the job is the documented way to correct a
 *      bad snapshot — so duplicates are the designed state, not an accident);
 *   2. what the uptime probe says after a multi-day cron gap, and that one fresh
 *      write through the cron's own insert path clears it;
 *   3. which access plans count as free access at the exact grace boundary.
 *
 * Each of those is an ORDER BY or a WHERE, and each is wrong silently: a reversed
 * sort or an off-by-one comparison returns a plausible number and no error.
 *
 * Nothing is mocked — no-mock-guard forbids it under __tests__/integration/, and
 * none of it is needed: the services and the health route are called directly.
 * The full cron route is NOT called, because `withCronJob` writes `cron_runs`,
 * which `cron-run-heartbeat.integration.test.ts` empties and counts in parallel.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/*
 * `revenue_snapshots` and `access_plans` are platform-scoped — no scoped client
 * can address `revenue_snapshots` at all. The reads below are this file's own
 * assertions about rows it just wrote.
 */
// AUTHZ: platform-scoped revenue metrics fixtures; no tenant data is read through this client.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { accessPlans, communities, revenueSnapshots, users } from '@propertypro/db';

import { GET as healthGET } from '@/app/api/v1/internal/revenue-snapshot/health/route';
import {
  getLatestRevenueSnapshotForHealth,
  getPriorSnapshotMrr,
  insertRevenueSnapshot,
  loadRevenueSnapshotInputs,
} from '@/lib/services/revenue-snapshot-data-service';
import type { SnapshotComputation } from '@/lib/services/revenue-snapshot-service';

import {
  getDescribeDb,
  initTestKit,
  requireDatabaseUrlInCI,
  teardownTestKit,
  trackCommunityForCleanup,
  trackUserForCleanup,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Revenue snapshot integration tests');

const describeDb = getDescribeDb();

function computation(mrrCents: number): SnapshotComputation {
  return {
    mrrCents,
    potentialMrrCents: mrrCents,
    activeSubscriptions: 1,
    trialingSubscriptions: 0,
    pastDueSubscriptions: 0,
    byPlan: {},
    byCommunityType: {},
    volumeDiscountSavingsCents: 0,
    freeAccessCostCents: 0,
    pricesVersion: 'integration-test',
    communitiesSkipped: 0,
    skipReasons: [],
  };
}

function writeSnapshot(snapshotDate: string, mrrCents: number): Promise<void> {
  return insertRevenueSnapshot({
    snapshotDate,
    computation: computation(mrrCents),
    reconciliationDriftPct: null,
    deltaPct: null,
  });
}

describeDb('revenue snapshots (db-backed integration)', () => {
  const db = createUnscopedClient();

  /**
   * `revenue_snapshots` has no tenant or run key to isolate on, and every
   * reader under test answers "the newest row in the WHOLE table" — a stray
   * row from an earlier case would decide the answer. No other integration
   * file touches this table, and a test database holds no real snapshots, so
   * emptying it between cases is both safe and necessary.
   */
  const clear = () => db.execute(sql`DELETE FROM revenue_snapshots`);

  beforeEach(clear);
  afterAll(clear);

  async function snapshotRows() {
    return db
      .select({
        id: revenueSnapshots.id,
        mrrCents: revenueSnapshots.mrrCents,
        computedAt: revenueSnapshots.computedAt,
      })
      .from(revenueSnapshots)
      .orderBy(revenueSnapshots.id);
  }

  describe('two snapshots on the same day', () => {
    it('a re-run supersedes the earlier row for that day', async () => {
      // The runbook's correction procedure: fix the upstream data, run the job
      // again. The table keeps both rows; the reader must pick the second.
      await writeSnapshot('2026-10-21', 1_000);
      await writeSnapshot('2026-10-21', 2_000);

      expect(await snapshotRows()).toHaveLength(2);
      expect(await getPriorSnapshotMrr()).toBe(2_000);
    });

    it('"latest" means latest computed_at, not highest id', async () => {
      /*
       * Two writes in a row always produce ids and computed_at in the same
       * order, so the case above cannot tell `ORDER BY computed_at DESC` from
       * `ORDER BY id DESC` (or from no tiebreak at all). Moving the
       * second-inserted row's computed_at BEFORE the first's separates them:
       * only a computed_at sort returns the first row now.
       */
      await writeSnapshot('2026-10-21', 1_000);
      await writeSnapshot('2026-10-21', 2_000);
      const [first, second] = await snapshotRows();
      await db.execute(
        sql`UPDATE revenue_snapshots SET computed_at = computed_at - interval '1 hour' WHERE id = ${second!.id}`,
      );

      expect(await getPriorSnapshotMrr()).toBe(1_000);
      // The health probe answers the same question for freshness.
      const latest = await getLatestRevenueSnapshotForHealth();
      expect(latest?.computedAt.getTime()).toBe(first!.computedAt.getTime());
    });

    it('a later day still wins over an earlier day computed afterwards', async () => {
      // getPriorSnapshotMrr sorts by snapshot_date FIRST. A row for an earlier
      // day with a later computed_at must not become "prior".
      await writeSnapshot('2026-10-21', 2_000);
      await writeSnapshot('2026-10-20', 1_000);

      expect(await getPriorSnapshotMrr()).toBe(2_000);
    });
  });

  describe('health probe after a cron gap', () => {
    async function probe() {
      const res = await healthGET();
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    }

    async function backdateAll(hours: number) {
      await db.execute(
        sql`UPDATE revenue_snapshots SET computed_at = now() - make_interval(hours => ${hours})`,
      );
    }

    it('reports 503 with no snapshot ever written', async () => {
      const { status, body } = await probe();
      expect(status).toBe(503);
      expect(body).toMatchObject({ status: 'unhealthy', reason: 'no_snapshots_ever' });
    });

    it('reports 503 after three days without a run, and 200 after one fresh write', async () => {
      // The runbook's merge gate, minus the HTTP hop: simulate staleness, see
      // the probe fail, run the job, see it recover.
      await writeSnapshot('2026-10-18', 1_000);
      await backdateAll(72);

      const stale = await probe();
      expect(stale.status).toBe(503);
      expect(stale.body.status).toBe('unhealthy');
      expect(stale.body.hours_since).toBeGreaterThanOrEqual(72);
      expect(stale.body.hours_since).toBeLessThan(73);

      // The cron's own write path. It does not pass computed_at, so this also
      // proves the column's default stamps the write — a recovery row that
      // inherited a caller's stale clock would leave the probe red.
      await writeSnapshot('2026-10-21', 1_000);

      const recovered = await probe();
      expect(recovered.status).toBe(200);
      expect(recovered.body.status).toBe('healthy');
      expect(recovered.body.hours_since).toBeLessThan(1);
      // Append-only: the stale row is still there; the probe just reads past it.
      expect(await snapshotRows()).toHaveLength(2);
    });

    it('draws the line at 26 hours: 25h is healthy, 27h is not', async () => {
      // One missed nightly run (the job fires every 24h) must not page anyone;
      // the second hour past a missed run must.
      await writeSnapshot('2026-10-20', 1_000);

      await backdateAll(25);
      expect((await probe()).status).toBe(200);

      await backdateAll(27);
      expect((await probe()).status).toBe(503);
    });
  });

  describe('access-plan grace boundary', () => {
    /*
     * The canonical status rule (`computeAccessPlanStatus`,
     * account-lifecycle-service.ts) is `now < graceEndsAt → 'in_grace'`, else
     * 'expired' — strict. So at the exact instant grace ends, the plan has
     * expired and the community no longer counts as free access. The snapshot
     * loader expresses that rule in SQL, and nothing else checks the two agree.
     */
    let kit: TestKitState | null = null;
    const ids = {} as Record<
      'tMinus1s' | 'tExact' | 'tPlus1s' | 'active' | 'revoked' | 'converted',
      number
    >;
    // Millisecond-exact, and stored exactly: timestamptz keeps microseconds.
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);
    const DAY = 24 * 60 * 60 * 1000;

    beforeAll(async () => {
      kit = await initTestKit();
      const grantedBy = randomUUID();
      await kit.db.insert(users).values({
        id: grantedBy,
        email: `revsnap-grantor+${kit.runSuffix}@example.com`,
        fullName: `Revenue Snapshot Grantor ${kit.runSuffix}`,
        phone: null,
      });
      trackUserForCleanup(kit, grantedBy);

      const plans: Array<{
        key: keyof typeof ids;
        expiresAt: Date;
        graceEndsAt: Date;
        revokedAt?: Date;
        convertedAt?: Date;
      }> = [
        { key: 'tMinus1s', expiresAt: at(-30 * DAY), graceEndsAt: at(-1000) },
        { key: 'tExact', expiresAt: at(-30 * DAY), graceEndsAt: at(0) },
        { key: 'tPlus1s', expiresAt: at(-30 * DAY), graceEndsAt: at(1000) },
        { key: 'active', expiresAt: at(10 * DAY), graceEndsAt: at(40 * DAY) },
        { key: 'revoked', expiresAt: at(10 * DAY), graceEndsAt: at(40 * DAY), revokedAt: at(-DAY) },
        { key: 'converted', expiresAt: at(10 * DAY), graceEndsAt: at(40 * DAY), convertedAt: at(-DAY) },
      ];

      for (const plan of plans) {
        const [community] = await kit.db
          .insert(communities)
          .values({
            name: `Revenue Snapshot ${plan.key} ${kit.runSuffix}`,
            slug: `revsnap-${plan.key.toLowerCase()}-${kit.runSuffix}`,
            communityType: 'condo_718',
            timezone: 'America/New_York',
          })
          .returning({ id: communities.id });
        trackCommunityForCleanup(kit, community!.id);
        ids[plan.key] = community!.id;

        await kit.db.insert(accessPlans).values({
          communityId: community!.id,
          expiresAt: plan.expiresAt,
          graceEndsAt: plan.graceEndsAt,
          durationMonths: 1,
          grantedBy,
          revokedAt: plan.revokedAt ?? null,
          convertedAt: plan.convertedAt ?? null,
        });
      }
    });

    afterAll(async () => {
      if (kit) await teardownTestKit(kit);
    });

    it('counts a plan up to, but not at, the instant its grace ends', async () => {
      const inputs = await loadRevenueSnapshotInputs(now);
      const mine = new Set(Object.values(ids));
      const counted = new Set(
        inputs.accessPlans.map((p) => p.communityId).filter((id) => mine.has(id)),
      );

      expect(counted.has(ids.tMinus1s)).toBe(false);
      expect(counted.has(ids.tExact)).toBe(false);
      expect(counted.has(ids.tPlus1s)).toBe(true);
    });

    it('counts an active plan, and never a revoked or converted one', async () => {
      // Controls: the boundary case above must not pass because the loader
      // returns nothing at all, or everything that has not lapsed.
      const inputs = await loadRevenueSnapshotInputs(now);
      const counted = new Set(inputs.accessPlans.map((p) => p.communityId));

      expect(counted.has(ids.active)).toBe(true);
      expect(counted.has(ids.revoked)).toBe(false);
      expect(counted.has(ids.converted)).toBe(false);
    });
  });
});
