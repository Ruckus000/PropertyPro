import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq, inArray, isNull, sql as drizzleSql } from 'drizzle-orm';
import * as schema from '../src/schema';
import {
  announcements,
  communities,
  demoSeedRegistry,
  documentCategories,
  documents,
  meetings,
  complianceChecklistItems,
} from '../src/schema';
import { runDemoSeed } from '../../../scripts/seed-demo';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const DEMO_SLUGS = ['sunset-condos', 'palm-shores-hoa', 'bay-view-apartments'] as const;

describeDb('demo seed integration', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false });
    db = drizzle(sql, { schema });
  });

  afterAll(async () => {
    await sql.end();
  });

  it('is idempotent and seeds expected demo entities', async () => {
    await runDemoSeed({ syncAuthUsers: false });
    await runDemoSeed({ syncAuthUsers: false });

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
    const bay = seededCommunities.find((row) => row.slug === 'bay-view-apartments');
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
            eq(demoSeedRegistry.seedKey, 'sunset-announcement-pinned'),
          ),
        );
      expect(duplicateRegistry).toHaveLength(1);
    }
  }, 120_000);

  it('creates correct system category counts per community type', async () => {
    const seededCommunities = await db
      .select()
      .from(communities)
      .where(inArray(communities.slug, [...DEMO_SLUGS]));

    const sunset = seededCommunities.find((row) => row.slug === 'sunset-condos');
    const palm = seededCommunities.find((row) => row.slug === 'palm-shores-hoa');
    const bay = seededCommunities.find((row) => row.slug === 'bay-view-apartments');

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

    // bay-view-apartments (apartment): expect exactly 6 system categories
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
});
