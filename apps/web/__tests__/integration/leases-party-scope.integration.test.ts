/**
 * GET /api/v1/leases against a real database: the non-manager read boundary.
 *
 * Leases v3 widened "a lease naming me" from `leases.resident_id = me` to also
 * cover a CURRENT lease_residents row naming me (co-tenants), via a SQL
 * subquery. Unit tests can only mock that subquery; this runs it. Real users
 * through the suite's test auth provider — nothing is mocked.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getDescribeDb,
  initTestKit,
  requireDatabaseUrlInCI,
  setActorById,
  teardownTestKit,
  trackCommunityForCleanup,
  trackUserForCleanup,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('leases-party-scope');
const describeDb = getDescribeDb();

type Handler = (req: NextRequest) => Promise<Response>;

describeDb('/api/v1/leases party scope (integration)', () => {
  let state: TestKitState;
  let GET: Handler;
  let communityId = 0;
  let otherCommunityId = 0;
  const ids = { shared: 0, outsiders: 0, removedOnly: 0, other: 0 };
  const manager = randomUUID();
  const primary = randomUUID();
  const coTenant = randomUUID();
  const removed = randomUUID();
  const outsider = randomUUID();

  const leaseIdsAs = async (userId: string, cid = communityId) => {
    setActorById(state, userId);
    const res = await GET(new NextRequest(`http://localhost:3000/api/v1/leases?communityId=${cid}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: number }> };
    return body.data.map((l) => l.id).sort((a, b) => a - b);
  };

  beforeAll(async () => {
    state = await initTestKit();
    const m = state.dbModule;
    const cids: number[] = [];
    for (const name of ['Party scope', 'Party scope other']) {
      const [c] = await state.db
        .insert(m.communities)
        .values({ name: `${name} ${state.runSuffix}`, slug: `lps-${randomUUID().slice(0, 8)}`, communityType: 'apartment' })
        .returning({ id: m.communities.id });
      trackCommunityForCleanup(state, c!.id);
      cids.push(c!.id);
    }
    [communityId, otherCommunityId] = cids as [number, number];

    for (const [id, label] of [
      [manager, 'manager'], [primary, 'primary'], [coTenant, 'cotenant'], [removed, 'removed'], [outsider, 'outsider'],
    ] as const) {
      trackUserForCleanup(state, id);
      await state.db.insert(m.users).values({ id, email: `lps-${label}+${state.runSuffix}@example.com`, fullName: label });
    }

    const scoped = m.createScopedClient(communityId);
    const other = m.createScopedClient(otherCommunityId);
    const u1 = (await scoped.insert(m.units, { unitNumber: '1' }))[0]!['id'] as number;
    const u2 = (await scoped.insert(m.units, { unitNumber: '2' }))[0]!['id'] as number;
    const u3 = (await scoped.insert(m.units, { unitNumber: '3' }))[0]!['id'] as number;
    const ou = (await other.insert(m.units, { unitNumber: '9' }))[0]!['id'] as number;

    await scoped.insert(m.userRoles, { userId: manager, role: 'property_manager', isUnitOwner: false, displayTitle: 'Manager' });
    for (const [userId, unitId] of [[primary, u1], [coTenant, u1], [removed, u3], [outsider, u2]] as const) {
      await scoped.insert(m.userRoles, { userId, role: 'resident', unitId, isUnitOwner: false, displayTitle: 'Tenant' });
    }
    // The co-tenant is also a resident elsewhere: that community's lease must not leak in.
    await other.insert(m.userRoles, { userId: coTenant, role: 'resident', unitId: ou, isUnitOwner: false, displayTitle: 'Tenant' });

    const lease = async (client: typeof scoped, unitId: number, residentId: string | null) =>
      (await client.insert(m.leases, { unitId, residentId, startDate: '2026-01-01', endDate: '2026-12-31', status: 'active' }))[0]!['id'] as number;
    ids.shared = await lease(scoped, u1, primary);
    ids.outsiders = await lease(scoped, u2, outsider);
    ids.removedOnly = await lease(scoped, u3, null);
    ids.other = await lease(other, ou, null);

    await scoped.insert(m.leaseResidents, [
      { leaseId: ids.shared, userId: primary, isPrimary: true, addedOn: '2026-01-01' },
      { leaseId: ids.shared, userId: coTenant, isPrimary: false, addedOn: '2026-01-01' },
      { leaseId: ids.outsiders, userId: outsider, isPrimary: true, addedOn: '2026-01-01' },
      // Taken off the lease: a removed row grants nothing.
      { leaseId: ids.removedOnly, userId: removed, isPrimary: true, addedOn: '2026-01-01', removedOn: '2026-03-01' },
    ]);
    await other.insert(m.leaseResidents, { leaseId: ids.other, userId: coTenant, isPrimary: true, addedOn: '2026-01-01' });

    ({ GET } = await import('../../src/app/api/v1/leases/route'));
  });

  afterAll(async () => {
    if (state) {
      const m = state.dbModule;
      const { inArray } = await import('@propertypro/db/filters');
      const all = [ids.shared, ids.outsiders, ids.removedOnly, ids.other].filter(Boolean);
      await state.db.delete(m.leaseResidents).where(inArray(m.leaseResidents.leaseId, all));
      await state.db.delete(m.leases).where(inArray(m.leases.id, all));
      await teardownTestKit(state);
    }
  });

  it('the legacy resident_id still grants the read', async () => {
    expect(await leaseIdsAs(primary)).toEqual([ids.shared]);
  });

  it('a co-tenant sees the lease they are on through lease_residents — and nothing else', async () => {
    expect(await leaseIdsAs(coTenant)).toEqual([ids.shared]);
  });

  it('a removed lease_residents row grants nothing', async () => {
    expect(await leaseIdsAs(removed)).toEqual([]);
  });

  it('another resident sees only their own lease', async () => {
    expect(await leaseIdsAs(outsider)).toEqual([ids.outsiders]);
  });

  it('the co-tenant reads the other community only there, and only their lease', async () => {
    expect(await leaseIdsAs(coTenant, otherCommunityId)).toEqual([ids.other]);
  });

  it('the manager sees every lease in the community (control)', async () => {
    expect(await leaseIdsAs(manager)).toEqual([ids.shared, ids.outsiders, ids.removedOnly].sort((a, b) => a - b));
  });
});
