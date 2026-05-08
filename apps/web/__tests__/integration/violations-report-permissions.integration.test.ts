import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS, type MultiTenantUserKey } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  apiUrl,
  getDescribeDb,
  initTestKit,
  jsonRequest,
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

requireDatabaseUrlInCI('Violations report permission-matrix integration tests');

const describeDb = getDescribeDb();

type ViolationsRouteModule = typeof import('../../src/app/api/v1/violations/route');

interface Ctx {
  state: TestKitState;
  routes: { violations: ViolationsRouteModule };
  unitAId: number;
  unitBId: number;
  otherUnitAId: number;
  unitlessResidentId: string;
}

let ctx: Ctx | null = null;
function req(): Ctx {
  if (!ctx) throw new Error('Test context not initialized');
  return ctx;
}

describeDb('violations reporting permission matrix', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    const state = await initTestKit();

    const selected = MULTI_TENANT_COMMUNITIES.filter((c) =>
      ['communityA', 'communityB'].includes(c.key),
    );
    await seedCommunities(state, selected);

    const communityA = requireCommunity(state, 'communityA');
    const communityB = requireCommunity(state, 'communityB');
    const scopedA = state.dbModule.createScopedClient(communityA.id);
    const scopedB = state.dbModule.createScopedClient(communityB.id);

    const [unitA] = await scopedA.insert(state.dbModule.units, {
      unitNumber: `PR5-A-${state.runSuffix}`,
      building: 'A',
      floor: 1,
    });
    const [otherUnitA] = await scopedA.insert(state.dbModule.units, {
      unitNumber: `PR5-A2-${state.runSuffix}`,
      building: 'A',
      floor: 2,
    });
    const [unitB] = await scopedB.insert(state.dbModule.units, {
      unitNumber: `PR5-B-${state.runSuffix}`,
      building: 'B',
      floor: 1,
    });
    const unitAId = readNumberField(unitA, 'id');
    const otherUnitAId = readNumberField(otherUnitA, 'id');
    const unitBId = readNumberField(unitB, 'id');

    const neededUsers: MultiTenantUserKey[] = ['actorA', 'tenantA', 'actorB'];
    const unitMap = new Map<MultiTenantUserKey, number>();
    unitMap.set('tenantA', unitAId);
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((u) => neededUsers.includes(u.key)),
      unitMap,
    );

    // Seed an additional resident in communityA with no unit association.
    const unitlessResidentId = randomUUID();
    await state.db.insert(state.dbModule.users).values({
      id: unitlessResidentId,
      email: `pr5-unitless+${state.runSuffix}@example.com`,
      fullName: `PR5 Unitless Resident ${state.runSuffix}`,
      phone: null,
    });
    trackUserForCleanup(state, unitlessResidentId);
    await scopedA.insert(state.dbModule.userRoles, {
      userId: unitlessResidentId,
      role: 'resident',
      isUnitOwner: false,
      displayTitle: 'Tenant',
      presetKey: null,
      permissions: null,
      unitId: null,
    });

    ctx = {
      state,
      routes: { violations: await import('../../src/app/api/v1/violations/route') },
      unitAId,
      unitBId,
      otherUnitAId,
      unitlessResidentId,
    };
  });

  beforeEach(() => {
    if (!ctx) return;
    setActor(ctx.state, 'actorA');
  });

  afterAll(async () => {
    if (ctx) await teardownTestKit(ctx.state);
  });

  it('resident with a unit can report for their own unit (201)', async () => {
    const { state, routes, unitAId } = req();
    const communityA = requireCommunity(state, 'communityA');
    setActor(state, 'tenantA');
    const res = await routes.violations.POST(
      jsonRequest(apiUrl('/api/v1/violations'), 'POST', {
        communityId: communityA.id,
        unitId: unitAId,
        category: 'noise',
        description: `resident self-report ${state.runSuffix}`,
      }),
    );
    expect(res.status).toBe(201);
  });

  it("resident cannot report for a unit they don't own (403)", async () => {
    const { state, routes, otherUnitAId } = req();
    const communityA = requireCommunity(state, 'communityA');
    setActor(state, 'tenantA');
    const res = await routes.violations.POST(
      jsonRequest(apiUrl('/api/v1/violations'), 'POST', {
        communityId: communityA.id,
        unitId: otherUnitAId,
        category: 'noise',
        description: 'wrong unit',
      }),
    );
    expect(res.status).toBe(403);
  });

  it('resident with zero units cannot report (403) and gets no leaked rows on GET', async () => {
    const { state, routes, unitAId, unitlessResidentId } = req();
    const communityA = requireCommunity(state, 'communityA');

    setActorById(state, unitlessResidentId);
    const postRes = await routes.violations.POST(
      jsonRequest(apiUrl('/api/v1/violations'), 'POST', {
        communityId: communityA.id,
        unitId: unitAId,
        category: 'noise',
        description: 'no-unit attempt',
      }),
    );
    expect(postRes.status).toBe(403);

    const getRes = await routes.violations.GET(
      new NextRequest(apiUrl(`/api/v1/violations?communityId=${communityA.id}`)),
    );
    expect(getRes.status).toBe(200);
    // Plan B3: /api/v1/violations now returns the canonical double-wrapped
    // paginated envelope `{ data: { data, pagination } }`.
    const body = await parseJson<{
      data: { data: unknown[]; pagination: unknown };
    }>(getRes);
    expect(Array.isArray(body.data.data)).toBe(true);
    expect(body.data.data).toHaveLength(0);
  });

  it('staff can file on behalf of any unit in their community (201) and is tagged as staff on read', async () => {
    const { state, routes, unitAId } = req();
    const communityA = requireCommunity(state, 'communityA');
    setActor(state, 'actorA');
    const res = await routes.violations.POST(
      jsonRequest(apiUrl('/api/v1/violations'), 'POST', {
        communityId: communityA.id,
        unitId: unitAId,
        category: 'pet',
        description: `staff filed ${state.runSuffix}`,
      }),
    );
    expect(res.status).toBe(201);
    const posted = await parseJson<{ data: Record<string, unknown> }>(res);
    const violationId = readNumberField(posted.data, 'id');

    const listRes = await routes.violations.GET(
      new NextRequest(apiUrl(`/api/v1/violations?communityId=${communityA.id}`)),
    );
    expect(listRes.status).toBe(200);
    const listBody = await parseJson<{
      data: {
        data: Array<{ id: number; reportedByRole: 'staff' | 'resident' | null }>;
        pagination: unknown;
      };
    }>(listRes);
    const row = listBody.data.data.find((v) => v.id === violationId);
    expect(row).toBeDefined();
    expect(row?.reportedByRole).toBe('staff');
  });

  it("staff cannot file for a unit that belongs to another community (404)", async () => {
    const { state, routes, unitBId } = req();
    const communityA = requireCommunity(state, 'communityA');
    setActor(state, 'actorA');
    const res = await routes.violations.POST(
      jsonRequest(apiUrl('/api/v1/violations'), 'POST', {
        communityId: communityA.id,
        unitId: unitBId,
        category: 'noise',
        description: 'cross-tenant attempt',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('resident GET sees reportedByRole="staff" on their own unit\'s staff-filed violation', async () => {
    const { state, routes, unitAId } = req();
    const communityA = requireCommunity(state, 'communityA');

    // Staff files for the resident's unit.
    setActor(state, 'actorA');
    const staffRes = await routes.violations.POST(
      jsonRequest(apiUrl('/api/v1/violations'), 'POST', {
        communityId: communityA.id,
        unitId: unitAId,
        category: 'landscaping',
        description: `staff-for-resident ${state.runSuffix}`,
      }),
    );
    expect(staffRes.status).toBe(201);
    const staffId = readNumberField(
      (await parseJson<{ data: Record<string, unknown> }>(staffRes)).data,
      'id',
    );

    // Resident reads — the row for their unit should be tagged staff.
    setActor(state, 'tenantA');
    const listRes = await routes.violations.GET(
      new NextRequest(apiUrl(`/api/v1/violations?communityId=${communityA.id}`)),
    );
    expect(listRes.status).toBe(200);
    const listBody = await parseJson<{
      data: {
        data: Array<{ id: number; reportedByRole: 'staff' | 'resident' | null }>;
        pagination: unknown;
      };
    }>(listRes);
    expect(listBody.data.data.find((v) => v.id === staffId)?.reportedByRole).toBe('staff');
  });

  it('GET returns reportedByRole=resident for resident-filed rows and staff for staff-filed rows', async () => {
    const { state, routes, unitAId } = req();
    const communityA = requireCommunity(state, 'communityA');

    // Resident files one.
    setActor(state, 'tenantA');
    const residentRes = await routes.violations.POST(
      jsonRequest(apiUrl('/api/v1/violations'), 'POST', {
        communityId: communityA.id,
        unitId: unitAId,
        category: 'parking',
        description: `resident row ${state.runSuffix}`,
      }),
    );
    expect(residentRes.status).toBe(201);
    const residentId = readNumberField(
      (await parseJson<{ data: Record<string, unknown> }>(residentRes)).data,
      'id',
    );

    // Staff files one.
    setActor(state, 'actorA');
    const staffRes = await routes.violations.POST(
      jsonRequest(apiUrl('/api/v1/violations'), 'POST', {
        communityId: communityA.id,
        unitId: unitAId,
        category: 'pet',
        description: `staff row ${state.runSuffix}`,
      }),
    );
    expect(staffRes.status).toBe(201);
    const staffId = readNumberField(
      (await parseJson<{ data: Record<string, unknown> }>(staffRes)).data,
      'id',
    );

    // List as staff and inspect both rows' reportedByRole.
    const listRes = await routes.violations.GET(
      new NextRequest(apiUrl(`/api/v1/violations?communityId=${communityA.id}`)),
    );
    const listBody = await parseJson<{
      data: {
        data: Array<{ id: number; reportedByRole: 'staff' | 'resident' | null }>;
        pagination: unknown;
      };
    }>(listRes);
    expect(listBody.data.data.find((v) => v.id === residentId)?.reportedByRole).toBe('resident');
    expect(listBody.data.data.find((v) => v.id === staffId)?.reportedByRole).toBe('staff');
  });
});
