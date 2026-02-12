import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq, inArray, sql as drizzleSql } from 'drizzle-orm';
import * as schema from '../src/schema';
import {
  announcements,
  communities,
  demoSeedRegistry,
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
});
