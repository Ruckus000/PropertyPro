import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq, inArray, isNull, sql as drizzleSql } from 'drizzle-orm';
import * as schema from '../src/schema';
import {
  announcements,
  billingGroups,
  communities,
  demoSeedRegistry,
  documentCategories,
  documents,
  leases,
  maintenanceRequests,
  meetings,
  complianceChecklistItems,
  units,
} from '../src/schema';
import { runDemoSeed } from '../../../scripts/seed-demo';

const describeDb = process.env.DATABASE_URL ? describe.sequential : describe.skip;
const itWithStripe = process.env.STRIPE_SECRET_KEY ? it : it.skip;

const DEMO_SLUGS = ['sunset-condos', 'palm-shores-hoa', 'sunset-ridge-apartments'] as const;

describeDb('demo seed integration', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false });
    db = drizzle(sql, { schema });

    await runDemoSeed({ syncAuthUsers: false });
    await runDemoSeed({ syncAuthUsers: false });
  }, 300_000);

  afterAll(async () => {
    await sql.end();
  });

  it('is idempotent and seeds expected demo entities', async () => {
    const seededCommunities = await db
      .select()
      .from(communities)
      .where(inArray(communities.slug, [...DEMO_SLUGS]));
    expect(seededCommunities).toHaveLength(3);

    const registryExistsResult = await db.execute<{ exists: boolean }>(drizzleSql`
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public' and table_name = 'demo_seed_registry'
      ) as exists
    `);
    const registryExistsRows = Array.isArray(registryExistsResult)
      ? registryExistsResult
      : ('rows' in registryExistsResult ? registryExistsResult.rows : []);
    const registryExists = registryExistsRows[0]?.exists === true;

    if (registryExists) {
      const registryRows = await db.select().from(demoSeedRegistry);
      expect(registryRows.length).toBeGreaterThanOrEqual(9);
    }

    const sunset = seededCommunities.find((row) => row.slug === 'sunset-condos');
    const palm = seededCommunities.find((row) => row.slug === 'palm-shores-hoa');
    const bay = seededCommunities.find((row) => row.slug === 'sunset-ridge-apartments');
    expect(sunset).toBeDefined();
    expect(palm).toBeDefined();
    expect(bay).toBeDefined();

    const seededAnnouncements = await db
      .select()
      .from(announcements)
      .where(
        inArray(
          announcements.communityId,
          [sunset!.id, palm!.id, bay!.id],
        ),
      );
    expect(seededAnnouncements.length).toBeGreaterThanOrEqual(3);

    const seededMeetings = await db
      .select()
      .from(meetings)
      .where(
        inArray(
          meetings.communityId,
          [sunset!.id, palm!.id, bay!.id],
        ),
      );
    expect(seededMeetings.length).toBeGreaterThanOrEqual(3);

    const seededCategories = await db
      .select()
      .from(documentCategories)
      .where(
        inArray(
          documentCategories.communityId,
          [sunset!.id, palm!.id, bay!.id],
        ),
      );
    expect(seededCategories.length).toBeGreaterThan(0);

    const seededDocuments = await db
      .select()
      .from(documents)
      .where(
        inArray(
          documents.communityId,
          [sunset!.id, palm!.id, bay!.id],
        ),
      );
    expect(seededDocuments.length).toBeGreaterThanOrEqual(3);
    expect(seededDocuments.every((row) => row.categoryId != null)).toBe(true);

    const apartmentChecklist = await db
      .select()
      .from(complianceChecklistItems)
      .where(eq(complianceChecklistItems.communityId, bay!.id));
    expect(apartmentChecklist).toHaveLength(0);

    if (registryExists) {
      const duplicateRegistry = await db
        .select()
        .from(demoSeedRegistry)
        .where(
          and(
            eq(demoSeedRegistry.entityType, 'announcement'),
            eq(demoSeedRegistry.seedKey, 'sunset-condos-announcement-pool-maintenance'),
          ),
        );
      expect(duplicateRegistry).toHaveLength(1);
    }
  }, 30_000);

  it('creates correct system category counts per community type', async () => {
    const seededCommunities = await db
      .select()
      .from(communities)
      .where(inArray(communities.slug, [...DEMO_SLUGS]));

    const sunset = seededCommunities.find((row) => row.slug === 'sunset-condos');
    const palm = seededCommunities.find((row) => row.slug === 'palm-shores-hoa');
    const bay = seededCommunities.find((row) => row.slug === 'sunset-ridge-apartments');

    // sunset-condos (condo_718): expect exactly 5 system categories
    const sunsetCategories = await db
      .select()
      .from(documentCategories)
      .where(and(
        eq(documentCategories.communityId, sunset!.id),
        eq(documentCategories.isSystem, true),
      ));
    expect(sunsetCategories).toHaveLength(5);

    // palm-shores-hoa (hoa_720): expect exactly 5 system categories
    const palmCategories = await db
      .select()
      .from(documentCategories)
      .where(and(
        eq(documentCategories.communityId, palm!.id),
        eq(documentCategories.isSystem, true),
      ));
    expect(palmCategories).toHaveLength(5);

    // sunset-ridge-apartments (apartment): expect exactly 6 system categories
    const bayCategories = await db
      .select()
      .from(documentCategories)
      .where(and(
        eq(documentCategories.communityId, bay!.id),
        eq(documentCategories.isSystem, true),
      ));
    expect(bayCategories).toHaveLength(6);
  }, 30_000);

  it('has zero documents without a category', async () => {
    const seededCommunities = await db
      .select()
      .from(communities)
      .where(inArray(communities.slug, [...DEMO_SLUGS]));

    const communityIds = seededCommunities.map((c) => c.id);

    const orphaned = await db
      .select()
      .from(documents)
      .where(and(
        inArray(documents.communityId, communityIds),
        isNull(documents.categoryId),
      ));
    expect(orphaned).toHaveLength(0);
  }, 30_000);

  it('each demo community has at least 1 document', async () => {
    const seededCommunities = await db
      .select()
      .from(communities)
      .where(inArray(communities.slug, [...DEMO_SLUGS]));

    for (const community of seededCommunities) {
      const docs = await db
        .select()
        .from(documents)
        .where(eq(documents.communityId, community.id));
      expect(docs.length).toBeGreaterThanOrEqual(1);
    }
  }, 30_000);

  it('apartment demo has 20+ units, 15+ active leases, 8+ maintenance requests, 5+ announcements', async () => {
    const seededCommunities = await db
      .select()
      .from(communities)
      .where(inArray(communities.slug, [...DEMO_SLUGS]));

    const sunsetRidge = seededCommunities.find((row) => row.slug === 'sunset-ridge-apartments');
    expect(sunsetRidge).toBeDefined();

    const apartmentUnits = await db
      .select()
      .from(units)
      .where(eq(units.communityId, sunsetRidge!.id));
    expect(apartmentUnits.length).toBeGreaterThanOrEqual(20);

    const activeLeases = await db
      .select()
      .from(leases)
      .where(
        and(
          eq(leases.communityId, sunsetRidge!.id),
          eq(leases.status, 'active'),
          isNull(leases.deletedAt),
        ),
      );
    expect(activeLeases.length).toBeGreaterThanOrEqual(15);

    const maintenanceReqs = await db
      .select()
      .from(maintenanceRequests)
      .where(
        and(
          eq(maintenanceRequests.communityId, sunsetRidge!.id),
          isNull(maintenanceRequests.deletedAt),
        ),
      );
    expect(maintenanceReqs.length).toBeGreaterThanOrEqual(8);

    const statusCounts = maintenanceReqs.reduce<Record<string, number>>((acc, req) => {
      acc[req.status] = (acc[req.status] ?? 0) + 1;
      return acc;
    }, {});
    const distinctStatuses = Object.keys(statusCounts);
    expect(distinctStatuses.length).toBeGreaterThanOrEqual(2);

    const apartmentAnnouncements = await db
      .select()
      .from(announcements)
      .where(
        and(
          eq(announcements.communityId, sunsetRidge!.id),
          isNull(announcements.archivedAt),
        ),
      );
    expect(apartmentAnnouncements.length).toBeGreaterThanOrEqual(5);

    const leaseEndDates = activeLeases
      .filter((l) => l.endDate != null)
      .map((l) => new Date(l.endDate! + 'T00:00:00Z').getTime());
    const now = Date.now();
    const in30Days = now + 30 * 24 * 60 * 60 * 1000;
    const in60Days = now + 60 * 24 * 60 * 60 * 1000;
    const in90Days = now + 90 * 24 * 60 * 60 * 1000;
    const within30 = leaseEndDates.filter((d) => d >= now && d <= in30Days).length;
    const within60 = leaseEndDates.filter((d) => d >= now && d <= in60Days).length;
    const within90 = leaseEndDates.filter((d) => d >= now && d <= in90Days).length;

    expect(within30).toBeGreaterThanOrEqual(1);
    expect(within60).toBeGreaterThanOrEqual(1);
    expect(within90).toBeGreaterThanOrEqual(1);
  }, 30_000);

  itWithStripe('seeds PM portfolio billing with shared Stripe linkage and a synced tier_10 group', async () => {
    const seededCommunities = await db
      .select({
        id: communities.id,
        slug: communities.slug,
        stripeCustomerId: communities.stripeCustomerId,
        stripeSubscriptionId: communities.stripeSubscriptionId,
        subscriptionPlan: communities.subscriptionPlan,
        subscriptionStatus: communities.subscriptionStatus,
        billingGroupId: communities.billingGroupId,
      })
      .from(communities)
      .where(inArray(communities.slug, [...DEMO_SLUGS]));

    expect(seededCommunities).toHaveLength(3);
    expect(seededCommunities.every((community) => community.stripeCustomerId != null)).toBe(true);
    expect(seededCommunities.every((community) => community.stripeSubscriptionId != null)).toBe(true);
    expect(seededCommunities.every((community) => community.billingGroupId != null)).toBe(true);

    const billingGroupIds = [...new Set(seededCommunities.map((community) => community.billingGroupId))];
    const stripeCustomerIds = [...new Set(seededCommunities.map((community) => community.stripeCustomerId))];
    expect(billingGroupIds).toHaveLength(1);
    expect(stripeCustomerIds).toHaveLength(1);

    const planBySlug = Object.fromEntries(
      seededCommunities.map((community) => [community.slug, community.subscriptionPlan]),
    );
    expect(planBySlug).toMatchObject({
      'sunset-condos': 'essentials',
      'palm-shores-hoa': 'essentials',
      'sunset-ridge-apartments': 'operations_plus',
    });
    expect(seededCommunities.every((community) => community.subscriptionStatus === 'active')).toBe(true);

    const [group] = await db
      .select()
      .from(billingGroups)
      .where(eq(billingGroups.id, billingGroupIds[0]!));
    expect(group.activeCommunityCount).toBe(3);
    expect(group.volumeTier).toBe('tier_10');
    expect(group.couponSyncStatus).toBe('synced');
  }, 60_000);
});
