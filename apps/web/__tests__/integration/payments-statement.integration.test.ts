/**
 * Payments statement — staff community mode + regression coverage.
 *
 * Scenarios:
 *   1. pm_admin on finance-enabled community with no `unitId` → 200
 *      with `mode: 'community'`, aggregated balance, and line items that
 *      carry `unitNumber` per row.
 *   2. Single-unit resident with no `unitId` → 200 with `mode: 'unit'`
 *      (existing implicit-resolution behaviour).
 *   3. Multi-unit resident with no `unitId` → 400 (existing error path).
 *   4. Cross-tenant probe — pm_admin on community A requests community B
 *      → 403 from `requireCommunityMembership`.
 *   5. Essentials-plan community with staff actor → 403
 *      `PLAN_UPGRADE_REQUIRED` when plan gating is in effect.
 */
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from '@propertypro/db/filters';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS, type MultiTenantUserKey } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  apiUrl,
  getDescribeDb,
  initTestKit,
  parseJson,
  readNumberField,
  requireCommunity,
  requireDatabaseUrlInCI,
  seedCommunities,
  seedUsers,
  setActor,
  setActorById,
  teardownTestKit,
  trackUserForCleanup,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Payments statement staff-mode integration tests');

const describeDb = getDescribeDb();

type PaymentStatementRouteModule = typeof import('../../src/app/api/v1/payments/statement/route');

let state: TestKitState | null = null;
let statementRoute: PaymentStatementRouteModule | null = null;

let singleUnitOwnerId: string;
let multiUnitOwnerId: string;
let communityAUnitAId: number;
let communityAUnitBId: number;
let communityCUnitId: number;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function requireStatementRoute(): PaymentStatementRouteModule {
  if (!statementRoute) throw new Error('Statement route not loaded');
  return statementRoute;
}

describeDb('Payments statement — staff community mode', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    // Seed communityA (condo_718 — hasFinance) and communityC (apartment — hasFinance).
    const communityA = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityA');
    const communityC = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityC');
    if (!communityA || !communityC) {
      throw new Error('Required community fixtures missing');
    }
    await seedCommunities(state, [communityA, communityC]);

    // Seed staff users: actorA = board_president in community A, actorC =
    // pm_admin in community C (used as the cross-tenant foil).
    const neededUsers: MultiTenantUserKey[] = ['actorA', 'actorC'];
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((u) => neededUsers.includes(u.key)),
    );

    // Seed 2 units in community A and 1 unit in community C.
    const seededA = requireCommunity(state, 'communityA');
    const seededC = requireCommunity(state, 'communityC');
    const scopedA = state.dbModule.createScopedClient(seededA.id);
    const scopedC = state.dbModule.createScopedClient(seededC.id);

    const [unitAA] = await scopedA.insert(state.dbModule.units, {
      unitNumber: `PSTMT-A-${state.runSuffix}`,
      building: 'A',
      floor: 1,
    });
    const [unitAB] = await scopedA.insert(state.dbModule.units, {
      unitNumber: `PSTMT-B-${state.runSuffix}`,
      building: 'A',
      floor: 2,
    });
    const [unitC] = await scopedC.insert(state.dbModule.units, {
      unitNumber: `PSTMT-C-${state.runSuffix}`,
      building: 'C',
      floor: 1,
    });
    communityAUnitAId = readNumberField(unitAA!, 'id');
    communityAUnitBId = readNumberField(unitAB!, 'id');
    communityCUnitId = readNumberField(unitC!, 'id');

    // Single-unit resident owner in community A.
    singleUnitOwnerId = randomUUID();
    await state.db.insert(state.dbModule.users).values({
      id: singleUnitOwnerId,
      email: `pstmt-single+${state.runSuffix}@example.com`,
      fullName: `PSTMT Single Owner ${state.runSuffix}`,
      phone: null,
    });
    await scopedA.update(
      state.dbModule.units,
      { ownerUserId: singleUnitOwnerId },
      eq(state.dbModule.units.id, communityAUnitAId),
    );
    await scopedA.insert(state.dbModule.userRoles, {
      userId: singleUnitOwnerId,
      role: 'resident',
      isUnitOwner: true,
      displayTitle: 'Owner',
      unitId: null,
    });
    trackUserForCleanup(state, singleUnitOwnerId);

    // Multi-unit resident owner in community A — modelled through the
    // units.ownerUserId column (same pattern as finance-dues-ledger's
    // multi-unit owner test) since user_roles has a unique
    // (user_id, community_id) constraint that disallows two rows per user.
    multiUnitOwnerId = randomUUID();
    await state.db.insert(state.dbModule.users).values({
      id: multiUnitOwnerId,
      email: `pstmt-multi+${state.runSuffix}@example.com`,
      fullName: `PSTMT Multi Owner ${state.runSuffix}`,
      phone: null,
    });
    // Give the multi-unit owner its own pair of units so the single-unit
    // owner's assignment (unit A) is preserved.
    const [multiUnitA] = await scopedA.insert(state.dbModule.units, {
      unitNumber: `PSTMT-MA-${state.runSuffix}`,
      building: 'A',
      floor: 3,
    });
    const [multiUnitB] = await scopedA.insert(state.dbModule.units, {
      unitNumber: `PSTMT-MB-${state.runSuffix}`,
      building: 'A',
      floor: 4,
    });
    const multiUnitAId = readNumberField(multiUnitA!, 'id');
    const multiUnitBId = readNumberField(multiUnitB!, 'id');
    await scopedA.update(
      state.dbModule.units,
      { ownerUserId: multiUnitOwnerId },
      eq(state.dbModule.units.id, multiUnitAId),
    );
    await scopedA.update(
      state.dbModule.units,
      { ownerUserId: multiUnitOwnerId },
      eq(state.dbModule.units.id, multiUnitBId),
    );
    await scopedA.insert(state.dbModule.userRoles, {
      userId: multiUnitOwnerId,
      role: 'resident',
      isUnitOwner: true,
      displayTitle: 'Owner',
      unitId: null,
    });
    trackUserForCleanup(state, multiUnitOwnerId);

    // Seed a couple of assessment line items in community A so the community
    // statement has something to return.
    const [assessmentA] = await scopedA.insert(state.dbModule.assessments, {
      title: `Payments Staff Assessment ${state.runSuffix}`,
      description: null,
      amountCents: 10000,
      frequency: 'monthly',
      dueDay: 1,
      lateFeeAmountCents: 0,
      lateFeeDaysGrace: 0,
      startDate: '2026-01-01',
      endDate: null,
      isActive: true,
    });
    const assessmentAId = readNumberField(assessmentA!, 'id');
    await scopedA.insert(state.dbModule.assessmentLineItems, {
      assessmentId: assessmentAId,
      unitId: communityAUnitAId,
      amountCents: 10000,
      dueDate: '2026-03-01',
      status: 'pending',
      lateFeeCents: 0,
    });
    await scopedA.insert(state.dbModule.assessmentLineItems, {
      assessmentId: assessmentAId,
      unitId: communityAUnitBId,
      amountCents: 10000,
      dueDate: '2026-03-05',
      status: 'pending',
      lateFeeCents: 0,
    });

    // Seed a minimal line item on community C so cross-tenant isolation tests
    // don't accidentally pass due to empty data.
    await scopedC.insert(state.dbModule.assessmentLineItems, {
      assessmentId: null,
      unitId: communityCUnitId,
      amountCents: 5000,
      dueDate: '2026-03-10',
      status: 'pending',
      lateFeeCents: 0,
    });

    statementRoute = await import('../../src/app/api/v1/payments/statement/route');
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('returns community-mode statement for staff with no unitId', async () => {
    const kit = requireState();
    const route = requireStatementRoute();
    const communityA = requireCommunity(kit, 'communityA');
    setActor(kit, 'actorA');

    const response = await route.GET(
      new NextRequest(
        apiUrl(
          `/api/v1/payments/statement?communityId=${communityA.id}&startDate=2025-01-01&endDate=2026-12-31`,
        ),
      ),
    );
    expect(response.status).toBe(200);

    const body = await parseJson<{
      data: {
        mode: string;
        statement: {
          balanceCents: number;
          lineItems: Array<{ unitId: number; unitNumber: string; status: string }>;
        };
      };
    }>(response);

    expect(body.data.mode).toBe('community');
    expect(typeof body.data.statement.balanceCents).toBe('number');
    expect(body.data.statement.lineItems.length).toBeGreaterThan(0);
    // Every line item should carry both unitId and a non-empty unitNumber.
    for (const item of body.data.statement.lineItems) {
      expect(typeof item.unitId).toBe('number');
      expect(typeof item.unitNumber).toBe('string');
      expect(item.unitNumber.length).toBeGreaterThan(0);
    }
    // Across the seeded data there should be items for both units.
    const unitIds = new Set(body.data.statement.lineItems.map((i) => i.unitId));
    expect(unitIds.has(communityAUnitAId)).toBe(true);
    expect(unitIds.has(communityAUnitBId)).toBe(true);
  });

  it('returns unit-mode statement when staff scopes by unitId', async () => {
    const kit = requireState();
    const route = requireStatementRoute();
    const communityA = requireCommunity(kit, 'communityA');
    setActor(kit, 'actorA');

    const response = await route.GET(
      new NextRequest(
        apiUrl(
          `/api/v1/payments/statement?communityId=${communityA.id}&unitId=${communityAUnitAId}&startDate=2025-01-01&endDate=2026-12-31`,
        ),
      ),
    );
    expect(response.status).toBe(200);
    const body = await parseJson<{ data: { mode: string; statement: { unitId: number } } }>(response);
    expect(body.data.mode).toBe('unit');
    expect(body.data.statement.unitId).toBe(communityAUnitAId);
  });

  it('returns unit-mode statement for a single-unit resident without unitId', async () => {
    const kit = requireState();
    const route = requireStatementRoute();
    const communityA = requireCommunity(kit, 'communityA');
    setActorById(kit, singleUnitOwnerId);

    const response = await route.GET(
      new NextRequest(apiUrl(`/api/v1/payments/statement?communityId=${communityA.id}`)),
    );
    expect(response.status).toBe(200);
    const body = await parseJson<{ data: { mode: string; statement: { unitId: number } } }>(response);
    expect(body.data.mode).toBe('unit');
    expect(body.data.statement.unitId).toBe(communityAUnitAId);
  });

  it('returns 400 when a multi-unit resident omits unitId', async () => {
    const kit = requireState();
    const route = requireStatementRoute();
    const communityA = requireCommunity(kit, 'communityA');
    setActorById(kit, multiUnitOwnerId);

    const response = await route.GET(
      new NextRequest(apiUrl(`/api/v1/payments/statement?communityId=${communityA.id}`)),
    );
    expect(response.status).toBe(400);
  });

  it('rejects cross-tenant probes from staff', async () => {
    const kit = requireState();
    const route = requireStatementRoute();
    const communityC = requireCommunity(kit, 'communityC');
    // actorA is a manager on community A, not on community C — should 403.
    setActor(kit, 'actorA');

    const response = await route.GET(
      new NextRequest(apiUrl(`/api/v1/payments/statement?communityId=${communityC.id}`)),
    );
    expect(response.status).toBe(403);
  });

  it('enforces PLAN_UPGRADE_REQUIRED when community plan lacks finance', async () => {
    // Set community A's subscription_plan to 'essentials', which does NOT
    // include the finance feature per packages/shared plan config. Finance
    // request should 403 PLAN_UPGRADE_REQUIRED. We then restore the plan to
    // null so other tests in this block aren't affected.
    const kit = requireState();
    const route = requireStatementRoute();
    const communityA = requireCommunity(kit, 'communityA');

    await kit.db
      .update(kit.dbModule.communities)
      .set({ subscriptionPlan: 'essentials' })
      .where(eq(kit.dbModule.communities.id, communityA.id));

    try {
      setActor(kit, 'actorA');
      const response = await route.GET(
        new NextRequest(apiUrl(`/api/v1/payments/statement?communityId=${communityA.id}`)),
      );
      expect(response.status).toBe(403);
      const body = await parseJson<{ error?: { code?: string } }>(response);
      expect(body.error?.code ?? '').toBe('PLAN_UPGRADE_REQUIRED');
    } finally {
      await kit.db
        .update(kit.dbModule.communities)
        .set({ subscriptionPlan: null })
        .where(eq(kit.dbModule.communities.id, communityA.id));
    }
  });
  it('summary is exact in SQL: outstanding outside the window counts, other units/tenants do not', async () => {
    // Money fix (2026-09-30): outstanding items ignore the date window and the
    // totals come from a SQL aggregate, not from the listed rows.
    const kit = requireState();
    const route = requireStatementRoute();
    const communityA = requireCommunity(kit, 'communityA');
    const scopedA = kit.dbModule.createScopedClient(communityA.id);
    await scopedA.insert(kit.dbModule.assessmentLineItems, {
      assessmentId: null,
      unitId: communityAUnitAId,
      amountCents: 10000,
      dueDate: '2024-01-01', // overdue for years: before any window
      status: 'overdue',
      lateFeeCents: 700,
    });
    await scopedA.insert(kit.dbModule.assessmentLineItems, {
      assessmentId: null,
      unitId: communityAUnitAId,
      amountCents: 10000,
      dueDate: '2099-01-01', // future: after any window
      status: 'pending',
      lateFeeCents: 0,
    });
    await scopedA.insert(kit.dbModule.assessmentLineItems, {
      assessmentId: null,
      unitId: communityAUnitAId,
      amountCents: 99900,
      dueDate: '2024-02-01',
      status: 'paid', // history outside the window: neither listed nor owed
      lateFeeCents: 0,
    });
    // Soft-deleted: must count nowhere (the scoped client adds deleted_at IS NULL).
    const [deletedItem] = await scopedA.insert(kit.dbModule.assessmentLineItems, {
      assessmentId: null,
      unitId: communityAUnitAId,
      amountCents: 777700,
      dueDate: '2025-01-01',
      status: 'overdue',
      lateFeeCents: 0,
    });
    await kit.db
      .update(kit.dbModule.assessmentLineItems)
      .set({ deletedAt: new Date() })
      .where(eq(kit.dbModule.assessmentLineItems.id, readNumberField(deletedItem!, 'id')));
    // Rent: partially_paid is outstanding and counts its amount (no late fee).
    const [lease] = await scopedA.insert(kit.dbModule.leases, {
      unitId: communityAUnitAId,
      residentId: singleUnitOwnerId,
      startDate: '2019-01-01',
      status: 'active',
    });
    await scopedA.insert(kit.dbModule.rentObligations, {
      leaseId: readNumberField(lease!, 'id'),
      unitId: communityAUnitAId,
      periodStart: '2020-01-01',
      periodEnd: '2020-01-31',
      dueDate: '2020-01-01',
      amountCents: 20000,
      status: 'partially_paid',
    });
    setActor(kit, 'actorA');

    const unitResponse = await route.GET(
      new NextRequest(
        apiUrl(
          `/api/v1/payments/statement?communityId=${communityA.id}&unitId=${communityAUnitAId}&startDate=2026-03-01&endDate=2026-03-31`,
        ),
      ),
    );
    expect(unitResponse.status).toBe(200);
    const unitBody = await parseJson<{
      data: {
        statement: {
          lineItems: Array<{ dueDate: string; status: string }>;
          summary: { totalDueCents: number; overdueCount: number; outstandingCount: number };
          truncated: boolean;
        };
      };
    }>(unitResponse);
    expect(unitBody.data.statement.summary).toEqual({
      totalDueCents: 10000 + 10700 + 10000 + 20000,
      overdueCount: 1,
      outstandingCount: 4,
    });
    expect(unitBody.data.statement.lineItems.map((i) => i.dueDate)).toEqual([
      '2020-01-01',
      '2024-01-01',
      '2026-03-01',
      '2099-01-01',
    ]);
    expect(unitBody.data.statement.truncated).toBe(false);

    // Community mode: both of community A's units, never community C's 5000.
    const communityResponse = await route.GET(
      new NextRequest(apiUrl(`/api/v1/payments/statement?communityId=${communityA.id}`)),
    );
    expect(communityResponse.status).toBe(200);
    const communityBody = await parseJson<{
      data: { statement: { summary: { totalDueCents: number; outstandingCount: number } } };
    }>(communityResponse);
    expect(communityBody.data.statement.summary).toEqual({
      totalDueCents: 10000 + 10700 + 10000 + 10000 + 20000,
      overdueCount: 1,
      outstandingCount: 5,
    });
  });
});
