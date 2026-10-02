/**
 * POST /api/v1/import-units against a real database: preview writes nothing
 * and flags numbers already in the community (any case); import creates the
 * valid rows, audits each, and reports the rest. Auth is mocked to a manager
 * (and a resident for the refusal); everything below it is real.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { and, eq, inArray } from '@propertypro/db/filters';
import {
  getDescribeDb,
  initTestKit,
  requireDatabaseUrlInCI,
  teardownTestKit,
  trackCommunityForCleanup,
  trackUserForCleanup,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';

const { membershipMock } = vi.hoisted(() => ({ membershipMock: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: async () => '00000000-0000-4000-8000-0000000000a1' }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: membershipMock }));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: async () => undefined }));
vi.mock('@/lib/middleware/subscription-guard', () => ({ requireActiveSubscriptionForMutation: async () => undefined }));
vi.mock('@/lib/services/onboarding-checklist-service', () => ({ tryAutoComplete: async () => undefined }));

requireDatabaseUrlInCI('import-units');
const describeDb = getDescribeDb();

describeDb('POST /api/v1/import-units (integration)', () => {
  let state: TestKitState;
  let communityId = 0;
  let POST: (req: NextRequest) => Promise<Response>;

  const call = (csv: string, dryRun: boolean) =>
    POST(
      new NextRequest('http://localhost:3000/api/v1/import-units', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, csv, dryRun }),
      }),
    );
  const unitNumbers = async () => {
    const m = state.dbModule;
    const rows = await state.db.select({ n: m.units.unitNumber }).from(m.units).where(eq(m.units.communityId, communityId));
    return rows.map((r) => r.n).sort();
  };

  beforeAll(async () => {
    state = await initTestKit();
    const m = state.dbModule;
    const [community] = await state.db
      .insert(m.communities)
      .values({ name: `Import units ${state.runSuffix}`, slug: `import-units-${randomUUID().slice(0, 8)}`, communityType: 'condo_718' })
      .returning({ id: m.communities.id });
    communityId = community!.id;
    trackCommunityForCleanup(state, communityId);
    const actor = '00000000-0000-4000-8000-0000000000a1';
    trackUserForCleanup(state, actor);
    await state.db
      .insert(m.users)
      .values({ id: actor, email: `import-actor+${state.runSuffix}@example.com`, fullName: 'Import Actor' })
      .onConflictDoNothing();
    ({ POST } = await import('../../src/app/api/v1/import-units/route'));
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  beforeEach(async () => {
    membershipMock.mockResolvedValue({ communityId, role: 'property_manager', isAdmin: true, isUnitOwner: false, communityType: 'condo_718' });
    await state.db.delete(state.dbModule.units).where(eq(state.dbModule.units.communityId, communityId));
    await state.dbModule.createScopedClient(communityId).insert(state.dbModule.units, { unitNumber: '4B' });
  });

  const CSV = 'unit_number,building,occupancy\n101,A,owner_occupied\n4b,A,vacant\n102,A,\n102,B,\n';

  it('preview: writes nothing, flags the existing "4B" and the in-file repeat', async () => {
    const res = await call(CSV, true);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { units: Array<{ unitNumber: string }>; errors: Array<{ rowNumber: number; message: string }>; skippedCount: number } };
    expect(data.units.map((u) => u.unitNumber)).toEqual(['101', '102']);
    expect(data.errors.map((e) => [e.rowNumber, e.message])).toEqual([
      [5, "Unit '102' is already on row 4 of this file"],
      [3, "Unit '4b' already exists"],
    ]);
    expect(data.skippedCount).toBe(2);
    expect(await unitNumbers()).toEqual(['4B']);
  });

  it('import: creates the valid rows with confirmed occupancy, audits each, skips the rest', async () => {
    const res = await call(CSV, false);
    const { data } = (await res.json()) as { data: { importedCount: number; skippedCount: number } };
    expect(data).toMatchObject({ importedCount: 2, skippedCount: 2 });
    expect(await unitNumbers()).toEqual(['101', '102', '4B']);

    const m = state.dbModule;
    const [u101] = await state.db
      .select({ occupancy: m.units.occupancy, confirmed: m.units.occupancyConfirmedAt })
      .from(m.units)
      .where(and(eq(m.units.communityId, communityId), eq(m.units.unitNumber, '101')));
    expect(u101).toMatchObject({ occupancy: 'owner_occupied' });
    expect(u101!.confirmed).toBeInstanceOf(Date);

    const audits = await state.db
      .select({ id: m.complianceAuditLog.id })
      .from(m.complianceAuditLog)
      .where(and(eq(m.complianceAuditLog.communityId, communityId), inArray(m.complianceAuditLog.action, ['create']), eq(m.complianceAuditLog.resourceType, 'unit')));
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });

  it('refuses a member without units:write', async () => {
    membershipMock.mockResolvedValue({ communityId, role: 'resident', isAdmin: false, isUnitOwner: true, communityType: 'condo_718' });
    const res = await call(CSV, false);
    expect(res.status).toBe(403);
    expect(await unitNumbers()).toEqual(['4B']);
  });
});
