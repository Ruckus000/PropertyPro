/**
 * Directory CSV export against a real database: the rows, the per-role
 * columns, the formula-injection guard, and the audit row that records the
 * export (counts and columns — never the rows themselves).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from '@propertypro/db/filters';
import { buildDirectoryExport } from '../../src/lib/services/directory-export-service';
import {
  getDescribeDb,
  initTestKit,
  requireDatabaseUrlInCI,
  teardownTestKit,
  trackCommunityForCleanup,
  trackUserForCleanup,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('directory-export');
const describeDb = getDescribeDb();

describeDb('buildDirectoryExport (integration)', () => {
  let state: TestKitState;
  let communityId = 0;
  const actor = randomUUID();
  const owner = randomUUID();
  const tenant = randomUUID();

  beforeAll(async () => {
    state = await initTestKit();
    const m = state.dbModule;
    const [community] = await state.db
      .insert(m.communities)
      .values({ name: `Export ${state.runSuffix}`, slug: `export-${state.runSuffix}`, communityType: 'condo_718' })
      .returning({ id: m.communities.id });
    communityId = community!.id;
    trackCommunityForCleanup(state, communityId);
    const scoped = m.createScopedClient(communityId);
    const [u101] = await scoped.insert(m.units, { unitNumber: '101', building: 'A', occupancy: 'owner_occupied' });
    await scoped.insert(m.units, { unitNumber: '102', building: 'A', occupancy: 'vacant' });
    const unit101 = u101!['id'] as number;
    for (const [id, name, isUnitOwner] of [
      [actor, 'Pat Manager', false],
      [owner, '=HYPERLINK("http://evil")', true],
      [tenant, 'Tess Tenant', false],
    ] as const) {
      trackUserForCleanup(state, id);
      await state.db.insert(m.users).values({ id, email: `${id.slice(0, 8)}@example.com`, fullName: name, phone: '555-0100' });
    }
    await scoped.insert(m.userRoles, { userId: actor, role: 'property_manager', isUnitOwner: false, displayTitle: 'Manager' });
    await scoped.insert(m.userRoles, { userId: owner, role: 'resident', unitId: unit101, isUnitOwner: true, displayTitle: 'Owner' });
    await scoped.insert(m.userRoles, { userId: tenant, role: 'resident', unitId: unit101, isUnitOwner: false, displayTitle: 'Tenant' });
    await scoped.insert(m.violations, { unitId: unit101, category: 'noise', description: 'Loud', status: 'reported' });
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  const lines = (csv: string) => csv.trim().split('\r\n');

  it('manager units file: occupancy, owners, residents and open violations', async () => {
    const { csv, rowCount } = await buildDirectoryExport({
      communityId,
      kind: 'units',
      access: { isAdmin: true, canSeeBalances: false, canSeeViolations: true },
      actorUserId: actor,
    });
    expect(rowCount).toBe(2);
    const [header, first, second] = lines(csv);
    expect(header).toBe('Unit,Building,Floor,Bedrooms,Bathrooms,Sq ft,Occupancy,Owners,Residents,Open violations');
    // The owner's name is a formula: escaped so a spreadsheet shows it as text.
    expect(first).toBe(`101,A,,,,,Owner-occupied,"'=HYPERLINK(""http://evil"")",2,1`);
    expect(second).toBe('102,A,,,,,Vacant,,0,0');
  });

  it('non-manager units file: only the public columns', async () => {
    const { csv } = await buildDirectoryExport({
      communityId,
      kind: 'units',
      access: { isAdmin: false, canSeeBalances: false, canSeeViolations: false },
      actorUserId: owner,
    });
    expect(lines(csv)[0]).toBe('Unit,Building,Floor,Bedrooms,Bathrooms,Sq ft');
    expect(csv).not.toContain('HYPERLINK');
  });

  it('residents file honours the selection and leaves managers out', async () => {
    const { csv, rowCount } = await buildDirectoryExport({
      communityId,
      kind: 'residents',
      selection: { userIds: [tenant], occupantIds: [] },
      access: { isAdmin: true, canSeeBalances: false, canSeeViolations: false },
      actorUserId: actor,
    });
    expect(rowCount).toBe(1);
    expect(lines(csv)).toEqual([
      'Name,Email,Phone,Unit,Building,Type,Board,Portal',
      `Tess Tenant,${tenant.slice(0, 8)}@example.com,555-0100,101,A,Tenant,,Not invited`,
    ]);
  });

  it('every export is audited with counts and columns, never the rows', async () => {
    const m = state.dbModule;
    const rows = await state.db
      .select({ metadata: m.complianceAuditLog.metadata, resourceId: m.complianceAuditLog.resourceId })
      .from(m.complianceAuditLog)
      .where(and(eq(m.complianceAuditLog.communityId, communityId), eq(m.complianceAuditLog.action, 'directory_exported')));
    expect(rows).toHaveLength(3);
    const residents = rows.find((r) => r.resourceId === 'residents')!;
    expect(residents.metadata).toMatchObject({ kind: 'residents', rowCount: 1, selection: true });
    expect(JSON.stringify(rows)).not.toContain('Tess');
  });
});
