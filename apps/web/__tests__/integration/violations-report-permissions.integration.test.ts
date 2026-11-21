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
type ViolationDetailRouteModule = typeof import('../../src/app/api/v1/violations/[id]/route');

interface Ctx {
  state: TestKitState;
  routes: { violations: ViolationsRouteModule; detail: ViolationDetailRouteModule };
  unitAId: number;
  unitBId: number;
  otherUnitAId: number;
  unitlessResidentId: string;
  /** A resident of otherUnitA: the household a neighbour (tenantA) reports. */
  neighbourId: string;
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
    const unitAId = readNumberField(unitA!, 'id');
    const otherUnitAId = readNumberField(otherUnitA!, 'id');
    const unitBId = readNumberField(unitB!, 'id');

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

    // A resident of otherUnitA — the cited household in the D1a cases.
    const neighbourId = randomUUID();
    await state.db.insert(state.dbModule.users).values({
      id: neighbourId,
      email: `pr6-neighbour+${state.runSuffix}@example.com`,
      fullName: `PR6 Neighbour ${state.runSuffix}`,
      phone: null,
    });
    trackUserForCleanup(state, neighbourId);
    await scopedA.insert(state.dbModule.userRoles, {
      userId: neighbourId,
      role: 'resident',
      isUnitOwner: true,
      displayTitle: 'Owner',
      presetKey: null,
      permissions: null,
      unitId: otherUnitAId,
    });

    // actorA manages communityA but is a RESIDENT of communityB. The D1a
    // subquery must ask about the reporter's role in the case's OWN community,
    // so actorA's filings in A still count as staff filings.
    const actorA = state.users.get('actorA');
    if (!actorA) throw new Error('actorA not seeded');
    await scopedB.insert(state.dbModule.userRoles, {
      userId: actorA.id,
      role: 'resident',
      isUnitOwner: false,
      displayTitle: 'Tenant',
      presetKey: null,
      permissions: null,
      unitId: unitBId,
    });

    ctx = {
      state,
      routes: {
        violations: await import('../../src/app/api/v1/violations/route'),
        detail: await import('../../src/app/api/v1/violations/[id]/route'),
      },
      unitAId,
      unitBId,
      otherUnitAId,
      unitlessResidentId,
      neighbourId,
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
    expect(res.status).toBe(200);
  });

  // D1: a neighbour complaint is filed against the neighbour's unit.
  it("resident can report a neighbour's unit (200)", async () => {
    const { state, routes, otherUnitAId } = req();
    const communityA = requireCommunity(state, 'communityA');
    setActor(state, 'tenantA');
    const res = await routes.violations.POST(
      jsonRequest(apiUrl('/api/v1/violations'), 'POST', {
        communityId: communityA.id,
        unitId: otherUnitAId,
        category: 'noise',
        description: 'neighbour unit',
      }),
    );
    expect(res.status).toBe(200);
    const posted = await parseJson<{ data: Record<string, unknown> }>(res);
    expect(posted.data['unitId']).toBe(otherUnitAId);
  });

  it("resident cannot report a unit in another community (404)", async () => {
    const { state, routes, unitBId } = req();
    const communityA = requireCommunity(state, 'communityA');
    setActor(state, 'tenantA');
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
    expect(res.status).toBe(200);
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

  it('resident GET sees their unit\'s staff-filed violation while reported, without the reporter (D1b)', async () => {
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
    expect(staffRes.status).toBe(200);
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
    // Staff filings are not hidden while `reported` (D1a), but the household is
    // never told who filed (D1b) — not even "staff".
    const row = listBody.data.data.find((v) => v.id === staffId);
    expect(row).toBeDefined();
    expect(row?.reportedByRole).toBeNull();
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
    expect(residentRes.status).toBe(200);
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
    expect(staffRes.status).toBe(200);
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

  describe("a neighbour's report (D1a, real SQL)", () => {
    async function file(actor: 'tenantA' | 'actorA', unitId: number, description: string) {
      const { state, routes } = req();
      const communityA = requireCommunity(state, 'communityA');
      setActor(state, actor);
      const res = await routes.violations.POST(
        jsonRequest(apiUrl('/api/v1/violations'), 'POST', {
          communityId: communityA.id,
          unitId,
          category: 'noise',
          description,
        }),
      );
      expect(res.status).toBe(200);
      return readNumberField((await parseJson<{ data: Record<string, unknown> }>(res)).data, 'id');
    }

    async function listIds(): Promise<Array<{ id: number; reportedByUserId: string | null }>> {
      const { state, routes } = req();
      const communityA = requireCommunity(state, 'communityA');
      const res = await routes.violations.GET(
        new NextRequest(apiUrl(`/api/v1/violations?communityId=${communityA.id}`)),
      );
      expect(res.status).toBe(200);
      const body = await parseJson<{
        data: { data: Array<{ id: number; reportedByUserId: string | null }> };
      }>(res);
      return body.data.data;
    }

    async function detailStatus(id: number): Promise<number> {
      const { state, routes } = req();
      const communityA = requireCommunity(state, 'communityA');
      const res = await routes.detail.GET(
        new NextRequest(apiUrl(`/api/v1/violations/${id}?communityId=${communityA.id}`)),
        { params: Promise.resolve({ id: String(id) }) },
      );
      return res.status;
    }

    it('is hidden from the cited household while reported, list and detail', async () => {
      const { state, neighbourId, otherUnitAId } = req();
      const residentFiled = await file('tenantA', otherUnitAId, `d1a resident ${state.runSuffix}`);
      // Control: a staff filing on the same unit, same status, stays visible —
      // including from a manager who is a resident in ANOTHER community.
      const staffFiled = await file('actorA', otherUnitAId, `d1a staff ${state.runSuffix}`);

      setActorById(state, neighbourId);
      const ids = (await listIds()).map((v) => v.id);
      expect(ids).not.toContain(residentFiled);
      expect(ids).toContain(staffFiled);
      expect(await detailStatus(residentFiled)).toBe(404);
      expect(await detailStatus(staffFiled)).toBe(200);
    });

    // Command-palette search is a separate raw-SQL read path; it must apply
    // the same rule, or the hidden case's text leaks through a search box.
    it('is hidden from the household in search too, while staff filings are found', async () => {
      const { state, neighbourId, otherUnitAId } = req();
      const communityA = requireCommunity(state, 'communityA');
      const word = `zebracrossing${state.runSuffix}`.replace(/[^a-z0-9]/gi, '');
      const residentFiled = await file('tenantA', otherUnitAId, `${word} resident`);
      const staffFiled = await file('actorA', otherUnitAId, `${word} staff`);

      const hits = await state.dbModule.searchViolationsByTrigram(communityA.id, word, 20, {
        isAdmin: false,
        userId: neighbourId,
      });
      const ids = hits.results.map((r) => Number(r.id));
      expect(ids).toContain(staffFiled);
      expect(ids).not.toContain(residentFiled);

      const filerHits = await state.dbModule.searchViolationsByTrigram(communityA.id, word, 20, {
        isAdmin: true,
      });
      expect(filerHits.results.map((r) => Number(r.id))).toEqual(
        expect.arrayContaining([residentFiled, staffFiled]),
      );
    });

    it('shows to the household once it moves past reported, still without the reporter', async () => {
      const { state, neighbourId, otherUnitAId } = req();
      const communityA = requireCommunity(state, 'communityA');
      const id = await file('tenantA', otherUnitAId, `d1a noticed ${state.runSuffix}`);
      await state.dbModule
        .createScopedClient(communityA.id)
        .update(
          state.dbModule.violations,
          { status: 'noticed' },
          (await import('@propertypro/db/filters')).eq(state.dbModule.violations.id, id),
        );

      setActorById(state, neighbourId);
      const row = (await listIds()).find((v) => v.id === id);
      expect(row).toBeDefined();
      expect(row?.reportedByUserId).toBeNull();
    });

    it('is visible to the board, with the reporter', async () => {
      const { state, otherUnitAId } = req();
      const id = await file('tenantA', otherUnitAId, `d1a board ${state.runSuffix}`);
      const tenantA = state.users.get('tenantA')!;

      setActor(state, 'actorA');
      const row = (await listIds()).find((v) => v.id === id);
      expect(row?.reportedByUserId).toBe(tenantA.id);
    });

    it("the filer sees their own report on their own unit while it is reported", async () => {
      const { state, unitAId } = req();
      const id = await file('tenantA', unitAId, `d1a own ${state.runSuffix}`);
      const tenantA = state.users.get('tenantA')!;

      setActor(state, 'tenantA');
      const row = (await listIds()).find((v) => v.id === id);
      expect(row?.reportedByUserId).toBe(tenantA.id);
      expect(await detailStatus(id)).toBe(200);
    });
  });
});
