/**
 * /api/v1/occupants against a real database: household members (no portal
 * login) are manager-only, stay inside their community, save with the same
 * optimistic-concurrency token as units and residents, block deleting their
 * unit, and appear in the Directory export. A real manager, a real resident
 * and a manager of another community, through the suite's test auth provider —
 * nothing is mocked.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from '@propertypro/db/filters';
import { buildDirectoryExport } from '../../src/lib/services/directory-export-service';
import { listOccupantsForExport } from '../../src/lib/services/occupant-service';
import {
  getDescribeDb,
  initTestKit,
  requireDatabaseUrlInCI,
  teardownTestKit,
  setActorById,
  trackCommunityForCleanup,
  trackUserForCleanup,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('occupants');
const describeDb = getDescribeDb();

type Handler = (req: NextRequest) => Promise<Response>;
interface OccupantJson {
  id: number;
  unitId: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  isOwnerHousehold: boolean;
  updatedAt: string;
}

describeDb('/api/v1/occupants (integration)', () => {
  let state: TestKitState;
  let communityId = 0;
  let otherCommunityId = 0;
  let unitA = 0;
  let unitB = 0;
  let otherUnit = 0;
  let routes: { GET: Handler; POST: Handler; PATCH: Handler; DELETE: Handler };
  let unitsDELETE: Handler;
  const manager = randomUUID();
  const resident = randomUUID();
  const outsider = randomUUID();

  const send = (handler: Handler, method: string, body: unknown, path = '/api/v1/occupants') =>
    handler(
      new NextRequest(`http://localhost:3000${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  const list = (cid = communityId) =>
    routes.GET(new NextRequest(`http://localhost:3000/api/v1/occupants?communityId=${cid}`));
  const create = (over: Record<string, unknown> = {}) =>
    send(routes.POST, 'POST', { communityId, unitId: unitA, fullName: 'Kim Kid', ...over });
  const dataOf = async <T,>(res: Response) => ((await res.json()) as { data: T }).data;
  /** The list is keyset-paginated: `{ data: { data: rows, pagination } }`. */
  const rowsOf = async (res: Response) => (await dataOf<{ data: OccupantJson[] }>(res)).data;

  beforeAll(async () => {
    state = await initTestKit();
    const m = state.dbModule;
    const ids: number[] = [];
    for (const name of ['Occupants', 'Occupants other']) {
      const [c] = await state.db
        .insert(m.communities)
        .values({ name: `${name} ${state.runSuffix}`, slug: `occ-${randomUUID().slice(0, 8)}`, communityType: 'condo_718' })
        .returning({ id: m.communities.id });
      trackCommunityForCleanup(state, c!.id);
      ids.push(c!.id);
    }
    [communityId, otherCommunityId] = ids as [number, number];
    const scoped = m.createScopedClient(communityId);
    const otherScoped = m.createScopedClient(otherCommunityId);
    unitA = (await scoped.insert(m.units, { unitNumber: '101' }))[0]!['id'] as number;
    unitB = (await scoped.insert(m.units, { unitNumber: '102' }))[0]!['id'] as number;
    otherUnit = (await otherScoped.insert(m.units, { unitNumber: '9' }))[0]!['id'] as number;

    for (const [id, label] of [
      [manager, 'manager'],
      [resident, 'resident'],
      [outsider, 'outsider'],
    ] as const) {
      trackUserForCleanup(state, id);
      await state.db.insert(m.users).values({ id, email: `occ-${label}+${state.runSuffix}@example.com`, fullName: label });
    }
    await scoped.insert(m.userRoles, { userId: manager, role: 'property_manager', isUnitOwner: false, displayTitle: 'Manager' });
    await scoped.insert(m.userRoles, { userId: resident, role: 'resident', unitId: unitB, isUnitOwner: true, displayTitle: 'Owner' });
    await otherScoped.insert(m.userRoles, { userId: outsider, role: 'property_manager', isUnitOwner: false, displayTitle: 'Manager' });

    const occupants = await import('../../src/app/api/v1/occupants/route');
    routes = { GET: occupants.GET, POST: occupants.POST, PATCH: occupants.PATCH, DELETE: occupants.DELETE };
    ({ DELETE: unitsDELETE } = await import('../../src/app/api/v1/units/route'));
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  beforeEach(async () => {
    setActorById(state, manager);
    const { unitOccupants } = state.dbModule;
    await state.db.delete(unitOccupants).where(eq(unitOccupants.communityId, communityId));
  });

  describe('manager', () => {
    it('creates with no email, normalises the email it is given, and lists only live rows', async () => {
      const res = await create({ email: '  Kim@Example.COM ', phone: ' ', isOwnerHousehold: true });
      expect(res.status).toBe(200);
      const kim = await dataOf<OccupantJson>(res);
      expect(kim).toMatchObject({ unitId: unitA, fullName: 'Kim Kid', email: 'kim@example.com', phone: null, isOwnerHousehold: true });

      const noEmail = await dataOf<OccupantJson>(await create({ fullName: 'Gran', email: '' }));
      expect(noEmail.email).toBeNull();

      expect((await send(routes.DELETE, 'DELETE', { communityId, id: noEmail.id })).status).toBe(200);
      const rows = await rowsOf(await list());
      expect(rows.map((r) => r.fullName)).toEqual(['Kim Kid']);
    });

    it('a stale token is a 409 and writes nothing; a current one saves and is audited with only the change', async () => {
      const kim = await dataOf<OccupantJson>(await create());
      const first = await send(routes.PATCH, 'PATCH', { communityId, id: kim.id, phone: '555-0101', expectedUpdatedAt: kim.updatedAt });
      expect(first.status).toBe(200);
      const saved = await dataOf<OccupantJson>(first);
      expect(saved.updatedAt).not.toBe(kim.updatedAt);

      // A second tab still holding the original token.
      const stale = await send(routes.PATCH, 'PATCH', { communityId, id: kim.id, fullName: 'Kimberly', expectedUpdatedAt: kim.updatedAt });
      expect(stale.status).toBe(409);
      const [row] = await rowsOf(await list());
      expect(row).toMatchObject({ fullName: 'Kim Kid', phone: '555-0101' });

      const m = state.dbModule;
      const audits = await state.db
        .select({ action: m.complianceAuditLog.action, oldValues: m.complianceAuditLog.oldValues, newValues: m.complianceAuditLog.newValues })
        .from(m.complianceAuditLog)
        .where(
          and(
            eq(m.complianceAuditLog.communityId, communityId),
            eq(m.complianceAuditLog.resourceType, 'unit_occupant'),
            eq(m.complianceAuditLog.resourceId, String(kim.id)),
          ),
        );
      const update = audits.find((a) => a.action === 'update');
      expect(update).toMatchObject({ oldValues: { phone: null }, newValues: { phone: '555-0101' } });
      expect(audits.filter((a) => a.action === 'update')).toHaveLength(1);
    });

    it('moves between units of its own community only', async () => {
      const kim = await dataOf<OccupantJson>(await create());
      const moved = await send(routes.PATCH, 'PATCH', { communityId, id: kim.id, unitId: unitB });
      expect((await dataOf<OccupantJson>(moved)).unitId).toBe(unitB);

      const foreignUnit = await send(routes.PATCH, 'PATCH', { communityId, id: kim.id, unitId: otherUnit });
      expect(foreignUnit.status).toBeGreaterThanOrEqual(400);
      expect(foreignUnit.status).toBeLessThan(500);
      const foreignCreate = await create({ unitId: otherUnit });
      expect(foreignCreate.status).toBeGreaterThanOrEqual(400);
      expect(foreignCreate.status).toBeLessThan(500);
      expect((await rowsOf(await list())).map((r) => r.unitId)).toEqual([unitB]);
    });

    it('a unit with a household member on file cannot be deleted', async () => {
      await create();
      const res = await send(unitsDELETE, 'DELETE', { communityId, unitId: unitA }, '/api/v1/units');
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).toContain('1 household member(s) are still on file');
    });

    it('the Directory export includes them as "No login" rows, by occupant id', async () => {
      const kim = await dataOf<OccupantJson>(await create({ email: 'kim@example.com', isOwnerHousehold: true }));
      const { csv, rowCount } = await buildDirectoryExport({
        communityId,
        kind: 'residents',
        selection: { userIds: [], occupantIds: [kim.id] },
        access: { isAdmin: true, canSeeBalances: false, canSeeViolations: false },
        actorUserId: manager,
      });
      expect(rowCount).toBe(1);
      expect(csv.trim().split('\r\n')[1]).toBe('Kim Kid,kim@example.com,,101,,Household (owner),,No login');
    });
  });

  it('the list is keyset-paged, and a full export walks every page', async () => {
    const scoped = state.dbModule.createScopedClient(communityId);
    for (let i = 0; i < 120; i += 1) await scoped.insert(state.dbModule.unitOccupants, { unitId: unitA, fullName: `P${i}` });
    const first = await dataOf<{ data: OccupantJson[]; pagination: { hasMore: boolean } }>(
      await routes.GET(new NextRequest(`http://localhost:3000/api/v1/occupants?communityId=${communityId}&pageSize=50`)),
    );
    expect(first.data).toHaveLength(50);
    expect(first.pagination.hasMore).toBe(true);
    const all = await listOccupantsForExport(communityId);
    expect(new Set(all.map((o) => o.fullName)).size).toBe(120);
    expect(await listOccupantsForExport(communityId, [all[0]!.id])).toHaveLength(1);
    expect(await listOccupantsForExport(communityId, [])).toEqual([]);
  });

  describe('everyone else is refused', () => {
    it('a resident can neither list nor add, even for their own unit', async () => {
      await create();
      setActorById(state, resident);
      expect((await list()).status).toBe(403);
      expect((await create({ unitId: unitB })).status).toBe(403);
    });

    it("another community's manager cannot read, edit or remove them", async () => {
      const kim = await dataOf<OccupantJson>(await create());
      setActorById(state, outsider);
      expect((await list()).status).toBe(403);
      expect((await send(routes.PATCH, 'PATCH', { communityId, id: kim.id, fullName: 'X' })).status).toBe(403);
      expect((await send(routes.DELETE, 'DELETE', { communityId, id: kim.id })).status).toBe(403);
      // Their own community's id with this row's id finds nothing.
      expect((await send(routes.DELETE, 'DELETE', { communityId: otherCommunityId, id: kim.id })).status).toBe(404);

      setActorById(state, manager);
      expect((await rowsOf(await list())).map((r) => r.fullName)).toEqual(['Kim Kid']);
    });
  });
});
