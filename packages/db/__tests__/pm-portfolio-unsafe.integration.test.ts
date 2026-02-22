import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/schema';
import { communities } from '../src/schema/communities';
import { complianceChecklistItems } from '../src/schema/compliance-checklist-items';
import { leases } from '../src/schema/leases';
import { maintenanceRequests } from '../src/schema/maintenance-requests';
import { units } from '../src/schema/units';
import { userRoles } from '../src/schema/user-roles';
import { users } from '../src/schema/users';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const COMMUNITY_A_SLUG = '__test_pm_portfolio_a__';
const COMMUNITY_B_SLUG = '__test_pm_portfolio_b__';
const COMMUNITY_C_SLUG = '__test_pm_portfolio_c__';

describeDb('pm portfolio unsafe query helper (integration)', () => {
  let sqlClient: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let pmUserId: string;
  let outsiderUserId: string;
  let communityAId: number;
  let communityBId: number;
  let communityCId: number;
  let submittedByUserId: string;
  let deletedOnlyPmUserId: string;

  beforeAll(async () => {
    const module = await import('../src/unsafe');
    // Runtime import guard for helper export shape.
    expect(typeof module.findManagedCommunitiesPortfolioUnscoped).toBe('function');

    sqlClient = postgres(process.env.DATABASE_URL!, { prepare: false });
    db = drizzle(sqlClient, { schema });

    // Clear old test communities and dependent rows via cascade.
    await db.delete(communities).where(inArray(communities.slug, [COMMUNITY_A_SLUG, COMMUNITY_B_SLUG, COMMUNITY_C_SLUG]));

    pmUserId = randomUUID();
    outsiderUserId = randomUUID();
    submittedByUserId = randomUUID();
    deletedOnlyPmUserId = randomUUID();

    await db.insert(users).values([
      {
        id: pmUserId,
        email: `pm+${COMMUNITY_A_SLUG}@example.com`,
        fullName: 'PM User',
      },
      {
        id: outsiderUserId,
        email: `outsider+${COMMUNITY_A_SLUG}@example.com`,
        fullName: 'Outsider User',
      },
      {
        id: submittedByUserId,
        email: `submitter+${COMMUNITY_A_SLUG}@example.com`,
        fullName: 'Submitter User',
      },
      {
        id: deletedOnlyPmUserId,
        email: `deleted-only-pm+${COMMUNITY_A_SLUG}@example.com`,
        fullName: 'Deleted Community PM User',
      },
    ]);

    const insertedCommunities = await db
      .insert(communities)
      .values([
        {
          name: 'PM Portfolio A',
          slug: COMMUNITY_A_SLUG,
          communityType: 'condo_718',
          timezone: 'America/New_York',
        },
        {
          name: 'PM Portfolio B',
          slug: COMMUNITY_B_SLUG,
          communityType: 'apartment',
          timezone: 'America/Chicago',
        },
        {
          name: 'PM Portfolio C',
          slug: COMMUNITY_C_SLUG,
          communityType: 'hoa_720',
          timezone: 'America/New_York',
        },
      ])
      .returning({ id: communities.id, slug: communities.slug });

    communityAId = insertedCommunities.find((row) => row.slug === COMMUNITY_A_SLUG)!.id;
    communityBId = insertedCommunities.find((row) => row.slug === COMMUNITY_B_SLUG)!.id;
    communityCId = insertedCommunities.find((row) => row.slug === COMMUNITY_C_SLUG)!.id;

    await db.insert(userRoles).values([
      { userId: pmUserId, communityId: communityAId, role: 'property_manager_admin' },
      { userId: pmUserId, communityId: communityBId, role: 'property_manager_admin' },
      { userId: outsiderUserId, communityId: communityCId, role: 'board_member' },
      { userId: submittedByUserId, communityId: communityAId, role: 'tenant' },
      { userId: submittedByUserId, communityId: communityBId, role: 'tenant' },
      { userId: deletedOnlyPmUserId, communityId: communityCId, role: 'property_manager_admin' },
    ]);
  });

  beforeEach(async () => {
    await db.delete(maintenanceRequests).where(inArray(maintenanceRequests.communityId, [communityAId, communityBId, communityCId]));
    await db.delete(complianceChecklistItems).where(inArray(complianceChecklistItems.communityId, [communityAId, communityBId, communityCId]));
    // Delete leases before units (FK: leases.unit_id -> units.id)
    await db.delete(leases).where(inArray(leases.communityId, [communityAId, communityBId, communityCId]));
    await db.delete(units).where(inArray(units.communityId, [communityAId, communityBId, communityCId]));
  });

  afterAll(async () => {
    await db.delete(communities).where(inArray(communities.slug, [COMMUNITY_A_SLUG, COMMUNITY_B_SLUG, COMMUNITY_C_SLUG]));
    await db
      .delete(users)
      .where(inArray(users.id, [pmUserId, outsiderUserId, submittedByUserId, deletedOnlyPmUserId]));
    await sqlClient.end();
  });

  it('isPmAdminInAnyCommunity returns true for PM users in active communities', async () => {
    const { isPmAdminInAnyCommunity } = await import('../src/unsafe');
    await expect(isPmAdminInAnyCommunity(pmUserId)).resolves.toBe(true);
  });

  it('isPmAdminInAnyCommunity returns false for users without PM role', async () => {
    const { isPmAdminInAnyCommunity } = await import('../src/unsafe');
    await expect(isPmAdminInAnyCommunity(outsiderUserId)).resolves.toBe(false);
  });

  it('isPmAdminInAnyCommunity excludes PM roles from soft-deleted communities', async () => {
    await db
      .update(communities)
      .set({ deletedAt: new Date() })
      .where(eq(communities.id, communityCId));

    try {
      const { isPmAdminInAnyCommunity } = await import('../src/unsafe');
      await expect(isPmAdminInAnyCommunity(deletedOnlyPmUserId)).resolves.toBe(false);
    } finally {
      await db
        .update(communities)
        .set({ deletedAt: null })
        .where(and(eq(communities.id, communityCId), eq(communities.slug, COMMUNITY_C_SLUG)));
    }
  });

  it('returns only communities where PM user has property_manager_admin role', async () => {
    const { findManagedCommunitiesPortfolioUnscoped } = await import('../src/unsafe');

    const rows = await findManagedCommunitiesPortfolioUnscoped(pmUserId);
    const ids = rows.map((row) => row.communityId).sort((a, b) => a - b);

    expect(ids).toEqual([communityAId, communityBId]);
    expect(rows.every((row) => row.communityId !== communityCId)).toBe(true);
  });

  it('returns aggregated metrics for residents, units, maintenance, and compliance', async () => {
    await db.insert(units).values([
      { communityId: communityAId, unitNumber: '101' },
      { communityId: communityAId, unitNumber: '102' },
      { communityId: communityBId, unitNumber: '201' },
    ]);

    await db.insert(maintenanceRequests).values([
      {
        communityId: communityAId,
        unitId: null,
        submittedById: submittedByUserId,
        title: 'Leak A',
        description: 'Leak description',
        status: 'open',
        priority: 'normal',
      },
      {
        communityId: communityAId,
        unitId: null,
        submittedById: submittedByUserId,
        title: 'Leak B',
        description: 'Leak description',
        status: 'in_progress',
        priority: 'high',
      },
      {
        communityId: communityBId,
        unitId: null,
        submittedById: submittedByUserId,
        title: 'Leak C',
        description: 'Leak description',
        status: 'closed',
        priority: 'low',
      },
    ]);

    await db.insert(complianceChecklistItems).values([
      {
        communityId: communityAId,
        templateKey: 'test_pm_portfolio_item_a',
        title: 'Checklist A',
        category: 'governing_documents',
        documentId: null,
      },
      {
        communityId: communityBId,
        templateKey: 'test_pm_portfolio_item_b',
        title: 'Checklist B',
        category: 'governing_documents',
        documentId: null,
      },
    ]);

    const { findManagedCommunitiesPortfolioUnscoped } = await import('../src/unsafe');
    const rows = await findManagedCommunitiesPortfolioUnscoped(pmUserId);

    const rowA = rows.find((row) => row.communityId === communityAId);
    const rowB = rows.find((row) => row.communityId === communityBId);

    expect(rowA).toBeDefined();
    expect(rowA!.residentCount).toBeGreaterThanOrEqual(2);
    expect(rowA!.totalUnits).toBe(2);
    expect(rowA!.openMaintenanceRequests).toBe(2);
    expect(rowA!.unsatisfiedComplianceItems).toBe(1);

    expect(rowB).toBeDefined();
    expect(rowB!.totalUnits).toBe(1);
    expect(rowB!.openMaintenanceRequests).toBe(0);
    expect(rowB!.unsatisfiedComplianceItems).toBe(1);
  });

  it('returns empty array for users without PM portfolio role', async () => {
    const { findManagedCommunitiesPortfolioUnscoped } = await import('../src/unsafe');
    const rows = await findManagedCommunitiesPortfolioUnscoped(outsiderUserId);
    expect(rows).toEqual([]);
  });

  it('does not include soft-deleted communities', async () => {
    await db
      .update(communities)
      .set({ deletedAt: new Date() })
      .where(eq(communities.id, communityBId));

    const { findManagedCommunitiesPortfolioUnscoped } = await import('../src/unsafe');
    const rows = await findManagedCommunitiesPortfolioUnscoped(pmUserId);

    expect(rows.some((row) => row.communityId === communityBId)).toBe(false);

    await db
      .update(communities)
      .set({ deletedAt: null })
      .where(and(eq(communities.id, communityBId), eq(communities.slug, COMMUNITY_B_SLUG)));
  });

  // --- Occupancy metric tests (P3-45 extension) ---

  it('returns occupiedUnits=0 and occupancyRate=null for condo community', async () => {
    const { findManagedCommunitiesPortfolioUnscoped } = await import('../src/unsafe');
    const rows = await findManagedCommunitiesPortfolioUnscoped(pmUserId);
    const rowA = rows.find((row) => row.communityId === communityAId);

    // Community A is condo_718 — no lease tracking
    expect(rowA).toBeDefined();
    expect(rowA!.occupiedUnits).toBe(0);
    expect(rowA!.occupancyRate).toBeNull();
  });

  it('returns occupiedUnits=0 and occupancyRate=null for apartment with no units', async () => {
    const { findManagedCommunitiesPortfolioUnscoped } = await import('../src/unsafe');
    const rows = await findManagedCommunitiesPortfolioUnscoped(pmUserId);
    const rowB = rows.find((row) => row.communityId === communityBId);

    // Community B is apartment with no units seeded
    expect(rowB).toBeDefined();
    expect(rowB!.occupiedUnits).toBe(0);
    expect(rowB!.occupancyRate).toBeNull();
  });

  it('computes occupiedUnits and occupancyRate correctly for apartment with active leases', async () => {
    // Seed 4 units for the apartment community
    const insertedUnits = await db
      .insert(units)
      .values([
        { communityId: communityBId, unitNumber: 'B-101' },
        { communityId: communityBId, unitNumber: 'B-102' },
        { communityId: communityBId, unitNumber: 'B-103' },
        { communityId: communityBId, unitNumber: 'B-104' },
      ])
      .returning({ id: units.id });

    const [u1, u2, u3, u4] = insertedUnits;

    // 3 active leases, 1 expired (non-active)
    await db.insert(leases).values([
      {
        communityId: communityBId,
        unitId: u1!.id,
        residentId: submittedByUserId,
        startDate: '2025-01-01',
        status: 'active',
      },
      {
        communityId: communityBId,
        unitId: u2!.id,
        residentId: submittedByUserId,
        startDate: '2025-01-01',
        status: 'active',
      },
      {
        communityId: communityBId,
        unitId: u3!.id,
        residentId: submittedByUserId,
        startDate: '2025-01-01',
        status: 'active',
      },
      {
        communityId: communityBId,
        unitId: u4!.id,
        residentId: submittedByUserId,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        status: 'expired',
      },
    ]);

    const { findManagedCommunitiesPortfolioUnscoped } = await import('../src/unsafe');
    const rows = await findManagedCommunitiesPortfolioUnscoped(pmUserId);
    const rowB = rows.find((row) => row.communityId === communityBId);

    expect(rowB).toBeDefined();
    expect(rowB!.totalUnits).toBe(4);
    expect(rowB!.occupiedUnits).toBe(3); // only 3 active leases
    expect(rowB!.occupancyRate).toBe(75); // round(3/4 * 100) = 75
  });

  it('does not double-count a unit with multiple active leases (uses DISTINCT)', async () => {
    const insertedUnits = await db
      .insert(units)
      .values([
        { communityId: communityBId, unitNumber: 'C-101' },
        { communityId: communityBId, unitNumber: 'C-102' },
      ])
      .returning({ id: units.id });

    const [u1, u2] = insertedUnits;

    // Two active leases on the same unit (edge case — renewal overlap)
    await db.insert(leases).values([
      {
        communityId: communityBId,
        unitId: u1!.id,
        residentId: submittedByUserId,
        startDate: '2025-01-01',
        status: 'active',
      },
      {
        communityId: communityBId,
        unitId: u1!.id,
        residentId: submittedByUserId,
        startDate: '2025-06-01',
        status: 'active',
      },
      {
        communityId: communityBId,
        unitId: u2!.id,
        residentId: submittedByUserId,
        startDate: '2025-01-01',
        status: 'active',
      },
    ]);

    const { findManagedCommunitiesPortfolioUnscoped } = await import('../src/unsafe');
    const rows = await findManagedCommunitiesPortfolioUnscoped(pmUserId);
    const rowB = rows.find((row) => row.communityId === communityBId);

    expect(rowB).toBeDefined();
    expect(rowB!.totalUnits).toBe(2);
    expect(rowB!.occupiedUnits).toBe(2); // DISTINCT unit_id: 2 unique units
    expect(rowB!.occupancyRate).toBe(100);
  });

  it('excludes soft-deleted leases from occupancy count', async () => {
    const insertedUnits = await db
      .insert(units)
      .values([
        { communityId: communityBId, unitNumber: 'D-101' },
        { communityId: communityBId, unitNumber: 'D-102' },
      ])
      .returning({ id: units.id });

    const [u1, u2] = insertedUnits;

    await db.insert(leases).values([
      {
        communityId: communityBId,
        unitId: u1!.id,
        residentId: submittedByUserId,
        startDate: '2025-01-01',
        status: 'active',
        deletedAt: new Date(), // soft-deleted — should NOT count
      },
      {
        communityId: communityBId,
        unitId: u2!.id,
        residentId: submittedByUserId,
        startDate: '2025-01-01',
        status: 'active', // active and not deleted — should count
      },
    ]);

    const { findManagedCommunitiesPortfolioUnscoped } = await import('../src/unsafe');
    const rows = await findManagedCommunitiesPortfolioUnscoped(pmUserId);
    const rowB = rows.find((row) => row.communityId === communityBId);

    expect(rowB).toBeDefined();
    expect(rowB!.occupiedUnits).toBe(1);
    expect(rowB!.occupancyRate).toBe(50); // 1/2 = 50%
  });

  it('filters by communityType=apartment and returns only apartment communities', async () => {
    const { findManagedCommunitiesPortfolioUnscoped } = await import('../src/unsafe');
    const rows = await findManagedCommunitiesPortfolioUnscoped(pmUserId, { communityType: 'apartment' });

    expect(rows.length).toBe(1);
    expect(rows[0]!.communityId).toBe(communityBId);
    expect(rows[0]!.communityType).toBe('apartment');
  });

  it('filters by communityType=condo_718 and excludes apartment', async () => {
    const { findManagedCommunitiesPortfolioUnscoped } = await import('../src/unsafe');
    const rows = await findManagedCommunitiesPortfolioUnscoped(pmUserId, { communityType: 'condo_718' });

    expect(rows.length).toBe(1);
    expect(rows[0]!.communityId).toBe(communityAId);
    expect(rows[0]!.communityType).toBe('condo_718');
  });
});
