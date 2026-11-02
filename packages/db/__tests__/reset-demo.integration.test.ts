import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { CommunityType } from '@propertypro/shared';
import { applyStarterPackToCommunity } from '@/lib/services/starter-pack-service';
import { getLook, lookIdForLayout, suggestedLookFor } from '@/lib/site-looks/looks';
import * as schema from '../src/schema';
import {
  announcements,
  communities,
  documents,
  meetings,
  siteBlocks,
  sitePages,
  sitePublishSnapshots,
  units,
} from '../src/schema';
import { runDemoReset } from '../../../scripts/reset-demo';
import { startSupabaseDouble, type SupabaseHttpDouble } from './helpers/supabase-http-double';

const describeDb = process.env.DATABASE_URL ? describe.sequential : describe.skip;

const DEMO_SLUGS = ['sunset-condos', 'palm-shores-hoa', 'sunset-ridge-apartments'] as const;

/**
 * Refuse any database not on this machine (CI's is an ephemeral container).
 * This file deletes and re-seeds the shared demo communities by slug, and the
 * repo's `.env.local` DATABASE_URL is PRODUCTION — so a run that inherited it
 * would reset the live demo tenants. Same guard as seed-community-counts.
 */
function assertLoopbackDatabaseOrCI(label: string): void {
  if (process.env.CI) return;
  let host = '';
  try {
    host = new URL(process.env.DATABASE_URL ?? '').hostname;
  } catch {
    throw new Error(`${label}: DATABASE_URL is not a parseable URL; refusing to run`);
  }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(
      `${label}: refusing to run against non-local database host '${host}'; use scripts/local-test-db.sh`,
    );
  }
}

/**
 * Exact document counts seeded per community by seed-demo.ts.
 * Used to detect both orphaned duplicates and missing data after reset.
 *
 * Derived from the seeder, not observed — re-derive when it changes:
 *   - sunset-condos: 2 base docs + the condo_718 compliance template (17 items)
 *     minus the 3 it deliberately leaves unposted (718_conflict_contracts,
 *     718_sirs, 718_insurance) + 10 rolling minutes = 26.
 *   - palm-shores-hoa: the 2 base docs only. seedTransparencyDemoData is
 *     skipped for it on purpose (#764), so staging E2E can assert the empty
 *     transparency state.
 *   - sunset-ridge-apartments: rules, move-in instructions, resident handbook.
 */
const EXPECTED_DOCS_PER_SLUG: Record<string, number> = {
  'sunset-condos': 26,
  'palm-shores-hoa': 2,
  'sunset-ridge-apartments': 3,
};

describeDb('demo reset integration', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  // The seed uploads document PDFs through Supabase Storage (seedEsignData and
  // the document seeders call createAdminClient()). Integration tests may not
  // mock a module, so the real supabase-js client talks to an in-process double.
  let double: SupabaseHttpDouble;
  const savedEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    pw: process.env.DEMO_DEFAULT_PASSWORD,
  };

  beforeAll(async () => {
    assertLoopbackDatabaseOrCI('reset-demo');
    sql = postgres(process.env.DATABASE_URL!, { prepare: false });
    db = drizzle(sql, { schema });

    double = await startSupabaseDouble();
    process.env.NEXT_PUBLIC_SUPABASE_URL = double.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'reset-demo-test-service-role';
    process.env.DEMO_DEFAULT_PASSWORD ??= 'reset-demo-test-password';

    await runDemoReset();
    await putDemosOnLegacySites();
    await runDemoReset();
  }, 300_000);

  /**
   * The state production's seeded demos were in before the seed gave them a
   * look: starter-pack sections, and a branding with no `layoutId`, which the
   * public site falls back to the type's legacy layout for. The second reset
   * above has to move them off it, as the first nightly reset in production does.
   */
  async function putDemosOnLegacySites(): Promise<void> {
    const demos = await db
      .select({ id: communities.id, communityType: communities.communityType, branding: communities.branding })
      .from(communities)
      .where(inArray(communities.slug, [...DEMO_SLUGS]));
    for (const demo of demos) {
      await db.delete(sitePages).where(eq(sitePages.communityId, demo.id));
      const { layoutId: _layout, themePresetSlug: _preset, ...rest } = (demo.branding ?? {}) as Record<string, unknown>;
      await db.update(communities).set({ branding: rest }).where(eq(communities.id, demo.id));
      const pack = await applyStarterPackToCommunity(demo.id, demo.communityType as CommunityType);
      if (!pack.applied) throw new Error(`No starter pack applied to demo ${demo.id}`);
      // A publish of that site, which names its (soon deleted) home page.
      await db.insert(sitePublishSnapshots).values({ communityId: demo.id, publishedAt: new Date(), changeCount: 1 });
    }
  }

  afterAll(async () => {
    await sql?.end();
    // Guarded: when beforeAll throws before the double starts, `double?.server`
    // is undefined, `resolve` is never called, and the hook would hang until
    // its 300s timeout.
    if (double) await new Promise((resolve) => double.server.close(resolve));
    for (const [name, value] of [
      ['NEXT_PUBLIC_SUPABASE_URL', savedEnv.url],
      ['SUPABASE_SERVICE_ROLE_KEY', savedEnv.key],
      ['DEMO_DEFAULT_PASSWORD', savedEnv.pw],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('resets and re-seeds demo data idempotently', async () => {
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
  }, 30_000);

  it('leaves no orphaned data from previous seed', async () => {
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
  }, 30_000);

  it('puts every demo on its suggested look, replacing a legacy site', async () => {
    const seededCommunities = await db
      .select({ id: communities.id, slug: communities.slug, communityType: communities.communityType, branding: communities.branding })
      .from(communities)
      .where(inArray(communities.slug, [...DEMO_SLUGS]));
    expect(seededCommunities).toHaveLength(3);

    for (const community of seededCommunities) {
      const look = getLook(suggestedLookFor(community.communityType as CommunityType));
      const layoutId = (community.branding as { layoutId?: string } | null)?.layoutId ?? null;
      expect(lookIdForLayout(layoutId), `seeded demo "${community.slug}" has no look layoutId`).not.toBeNull();
      expect(layoutId).toBe(look?.layoutId);

      const live = await db
        .select({ blockType: siteBlocks.blockType })
        .from(siteBlocks)
        .where(and(eq(siteBlocks.communityId, community.id), eq(siteBlocks.isDraft, false), isNull(siteBlocks.deletedAt)))
        .orderBy(asc(siteBlocks.blockOrder));
      expect(live.map((row) => row.blockType)).toEqual(look?.sections.map((section) => section.blockType));

      // No pre-reset version is left in the history: its pages are gone, so it
      // could only be refused on restore.
      const history = await db
        .select({ id: sitePublishSnapshots.id })
        .from(sitePublishSnapshots)
        .where(eq(sitePublishSnapshots.communityId, community.id));
      expect(history, `seeded demo "${community.slug}" kept a pre-reset publish`).toEqual([]);
    }
  }, 30_000);

  // Last, so it covers every request both seed runs above made.
  it('only used the Supabase endpoints the double implements', () => {
    expect(double.unexpected).toEqual([]);
  });
});
