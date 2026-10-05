/**
 * Leases v3 review fixes, against a real database:
 * - "current lease" in SQL (portfolio and reports) matches leasePhase: a
 *   renewed lease is replaced once its term ends, a past move-out has left, a
 *   future lease has not started, cancelled and deleted leases never count;
 * - "expiring" excludes a lease with a signed renewal or a scheduled move-out;
 * - Directory Remove erases a household member named only on a deleted lease;
 * - deposits come back oldest first even after an UPDATE reorders the heap;
 * - deleting a community whose lease names a household member succeeds.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql } from '@propertypro/db/filters';
// AUTHZ: integration test — SQL fragments for unscoped aggregate reads, run against a disposable local DB.
import { leaseCurrentOnSql, leaseExpiringBetweenSql } from '@propertypro/db/unsafe';
import {
  getDescribeDb,
  initTestKit,
  requireDatabaseUrlInCI,
  teardownTestKit,
  trackCommunityForCleanup,
  trackUserForCleanup,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('lease-current');
const describeDb = getDescribeDb();

describeDb('Leases v3: current leases, erasure and deposits (integration)', () => {
  let state: TestKitState;
  let communityId = 0;
  const ids: Record<string, number> = {};
  const manager = randomUUID();

  const day = (d: string) => sql`${d}::date`;

  beforeAll(async () => {
    state = await initTestKit();
    const m = state.dbModule;
    const [c] = await state.db
      .insert(m.communities)
      .values({ name: `Lease current ${state.runSuffix}`, slug: `lcur-${randomUUID().slice(0, 8)}`, communityType: 'apartment' })
      .returning({ id: m.communities.id });
    communityId = c!.id;
    trackCommunityForCleanup(state, communityId);
    trackUserForCleanup(state, manager);
    await state.db.insert(m.users).values({ id: manager, email: `lcur+${state.runSuffix}@example.com`, fullName: 'Manager' });

    const scoped = m.createScopedClient(communityId);
    for (const n of ['renewed', 'movedOut', 'future', 'holdover', 'cancelled', 'deleted', 'expiring', 'leaving']) {
      ids[`u_${n}`] = (await scoped.insert(m.units, { unitNumber: n }))[0]!['id'] as number;
    }
    const lease = async (key: string, unitKey: string, values: Record<string, unknown>) => {
      ids[key] = (await scoped.insert(m.leases, { unitId: ids[`u_${unitKey}`], status: 'active', ...values }))[0]!['id'] as number;
    };
    // Today is pinned by passing explicit dates to the helpers: 2026-10-04.
    await lease('old', 'renewed', { startDate: '2025-10-01', endDate: '2026-09-30' });
    await lease('renewal', 'renewed', { startDate: '2026-10-01', endDate: '2027-09-30', previousLeaseId: ids['old'] });
    await lease('movedOut', 'movedOut', { startDate: '2026-01-01', endDate: '2026-12-31', moveOutOn: '2026-09-15', endVia: 'early' });
    await lease('future', 'future', { startDate: '2026-11-01', endDate: '2027-10-31' });
    await lease('holdover', 'holdover', { startDate: '2025-06-01', endDate: '2026-05-31' });
    await lease('cancelled', 'cancelled', { startDate: '2026-01-01', endDate: '2026-12-31', status: 'cancelled' });
    await lease('deleted', 'deleted', { startDate: '2026-01-01', endDate: '2026-12-31' });
    await scoped.softDelete(m.leases, eq(m.leases.id, ids['deleted']!));
    await lease('expiring', 'expiring', { startDate: '2025-11-01', endDate: '2026-10-31' });
    await lease('leaving', 'leaving', { startDate: '2025-11-01', endDate: '2026-10-31', moveOutOn: '2026-10-31', endVia: 'notice' });
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  const currentOn = async (d: string) =>
    (
      await state.db
        .select({ id: state.dbModule.leases.id })
        .from(state.dbModule.leases)
        .where(and(eq(state.dbModule.leases.communityId, communityId), leaseCurrentOnSql(day(d))))
    )
      .map((r) => r.id)
      .sort((a, b) => a - b);

  it('current on a day: one lease per occupied unit, as leasePhase decides', async () => {
    expect(await currentOn('2026-10-04')).toEqual(
      [ids['renewal'], ids['holdover'], ids['expiring'], ids['leaving']].sort((a, b) => a! - b!),
    );
  });

  it('before the renewal starts, the old lease is the current one; the moved-out lease was still current', async () => {
    const before = await currentOn('2026-09-10');
    expect(before).toContain(ids['old']);
    expect(before).not.toContain(ids['renewal']);
    expect(before).toContain(ids['movedOut']);
  });

  it('expiring excludes a signed renewal, a scheduled move-out and a holdover', async () => {
    const m = state.dbModule;
    const rows = await state.db
      .select({ id: m.leases.id })
      .from(m.leases)
      .where(and(eq(m.leases.communityId, communityId), leaseExpiringBetweenSql(day('2026-10-04'), day('2026-12-03'))));
    expect(rows.map((r) => r.id)).toEqual([ids['expiring']]);
  });

  it('Directory Remove erases a household member named only on a deleted lease', async () => {
    const m = state.dbModule;
    const scoped = m.createScopedClient(communityId);
    const occupant = (await scoped.insert(m.unitOccupants, { unitId: ids['u_deleted'], fullName: 'Gran' }))[0]!['id'] as number;
    await scoped.insert(m.leaseResidents, { leaseId: ids['deleted'], occupantId: occupant, isPrimary: true, addedOn: '2026-01-01' });
    const { removeOccupant } = await import('../../src/lib/services/occupant-service');
    await removeOccupant(communityId, manager, occupant);
    const left = await state.db.select({ id: m.unitOccupants.id }).from(m.unitOccupants).where(eq(m.unitOccupants.id, occupant));
    expect(left).toEqual([]);
  });

  it('deposits come back oldest (lowest id) first, whatever the physical row order', async () => {
    const m = state.dbModule;
    const scoped = m.createScopedClient(communityId);
    const leaseId = ids['expiring']!;
    // Written newest-id first, so heap order is the reverse of id order — what
    // an UPDATE can do to real rows. Without ORDER BY, `.at(-1)` picks wrong.
    const seq = (await state.sqlClient`SELECT nextval('lease_deposits_id_seq') + 1000 AS next`) as unknown as Array<{ next: string }>;
    const older = Number(seq[0]!.next);
    const newer = older + 1;
    await scoped.insert(m.leaseDeposits, { id: newer, leaseId, amount: '1200.00' });
    await scoped.insert(m.leaseDeposits, { id: older, leaseId, amount: '1000.00' });
    const { listLeaseDeposits } = await import('../../src/lib/services/lease-service');
    expect((await listLeaseDeposits(communityId, [leaseId])).map((d) => d.id)).toEqual([older, newer]);
    await state.db.delete(m.leaseDeposits).where(inArray(m.leaseDeposits.id, [older, newer]));
  });

  it('deleting a community whose lease names a household member succeeds (the RESTRICT FK does not block it)', async () => {
    const m = state.dbModule;
    const [c] = await state.db
      .insert(m.communities)
      .values({ name: `Lease delete ${state.runSuffix}`, slug: `ldel-${randomUUID().slice(0, 8)}`, communityType: 'apartment' })
      .returning({ id: m.communities.id });
    const scoped = m.createScopedClient(c!.id);
    const unit = (await scoped.insert(m.units, { unitNumber: '1' }))[0]!['id'] as number;
    const occupant = (await scoped.insert(m.unitOccupants, { unitId: unit, fullName: 'Kim' }))[0]!['id'] as number;
    const leaseId = (await scoped.insert(m.leases, { unitId: unit, startDate: '2026-01-01', endDate: '2026-12-31', status: 'active' }))[0]!['id'] as number;
    await scoped.insert(m.leaseResidents, { leaseId, occupantId: occupant, isPrimary: true, addedOn: '2026-01-01' });
    await state.db.delete(m.communities).where(eq(m.communities.id, c!.id));
    expect(await state.db.select().from(m.communities).where(eq(m.communities.id, c!.id))).toEqual([]);
  });
});
