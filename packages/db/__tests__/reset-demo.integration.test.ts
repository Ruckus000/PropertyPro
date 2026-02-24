import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '../src/schema';
import {
  announcements,
  communities,
  documents,
  meetings,
  units,
} from '../src/schema';
import { runDemoReset } from '../../../scripts/reset-demo';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const DEMO_SLUGS = ['sunset-condos', 'palm-shores-hoa', 'sunset-ridge-apartments'] as const;

/**
 * Exact document counts seeded per community by seed-demo.ts.
 * Used to detect both orphaned duplicates and missing data after reset.
 */
const EXPECTED_DOCS_PER_SLUG: Record<string, number> = {
  'sunset-condos': 1,           // sunset-bylaws.pdf
  'palm-shores-hoa': 1,         // palm-budget.pdf
  'sunset-ridge-apartments': 2, // sunsetridge-rules.pdf, sunsetridge-move-in.pdf
};

describeDb('demo reset integration', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false });
    db = drizzle(sql, { schema });
  });

  afterAll(async () => {
    await sql.end();
  });

  it('resets and re-seeds demo data idempotently', async () => {
    // Run reset twice to verify idempotency
    await runDemoReset();
    await runDemoReset();

    // Verify communities exist after re-seed
    const seededCommunities = await db
      .select()
      .from(communities)
      .where(inArray(communities.slug, [...DEMO_SLUGS]));
    expect(seededCommunities).toHaveLength(3);

    const communityIds = seededCommunities.map((c) => c.id);

    // Verify documents re-seeded
    const seededDocuments = await db
      .select()
      .from(documents)
      .where(inArray(documents.communityId, communityIds));
    expect(seededDocuments.length).toBeGreaterThanOrEqual(3);

    // Verify meetings re-seeded
    const seededMeetings = await db
      .select()
      .from(meetings)
      .where(inArray(meetings.communityId, communityIds));
    expect(seededMeetings.length).toBeGreaterThanOrEqual(3);

    // Verify announcements re-seeded
    const seededAnnouncements = await db
      .select()
      .from(announcements)
      .where(inArray(announcements.communityId, communityIds));
    expect(seededAnnouncements.length).toBeGreaterThanOrEqual(3);

    // Verify apartment units re-seeded
    const sunsetRidge = seededCommunities.find((c) => c.slug === 'sunset-ridge-apartments');
    const apartmentUnits = await db
      .select()
      .from(units)
      .where(eq(units.communityId, sunsetRidge!.id));
    expect(apartmentUnits.length).toBeGreaterThanOrEqual(20);
  }, 180_000);

  it('leaves no orphaned data from previous seed', async () => {
    // Seed first, then reset
    await runDemoReset();

    const seededCommunities = await db
      .select()
      .from(communities)
      .where(inArray(communities.slug, [...DEMO_SLUGS]));

    // Each community should have exactly the seeded count (no stale duplicates)
    for (const community of seededCommunities) {
      const docs = await db
        .select()
        .from(documents)
        .where(eq(documents.communityId, community.id));
      const expected = EXPECTED_DOCS_PER_SLUG[community.slug];
      expect(expected, `No expected doc count for slug "${community.slug}"`).toBeDefined();
      expect(docs.length).toBe(expected);
    }
  }, 180_000);
});
