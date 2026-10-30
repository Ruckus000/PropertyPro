/**
 * The starter pack, against real Postgres.
 *
 * A new community no longer gets a starter pack (it gets its suggested look: see
 * new-community-look.integration.test.ts), but the seeded fixtures still apply
 * one, and racing applies are the case only real Postgres can answer: whether
 * the community row lock keeps the pack from landing twice, and a draft home
 * page goes live with it. A mock cannot show either.
 *
 * Nothing is mocked — no-mock-guard forbids it under __tests__/integration/.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { applyStarterPackToCommunity } from '@/lib/services/starter-pack-service';
import { ensureHomePage } from '@/lib/services/site-pages-service';
import {
  type TestKitState,
  initTestKit,
  teardownTestKit,
  trackCommunityForCleanup,
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Starter pack integration tests');

const describeDb = getDescribeDb();

describeDb('starter pack (db-backed integration)', () => {
  let state: TestKitState | null = null;

  async function createCommunity(label: string): Promise<number> {
    if (!state) throw new Error('Not initialized');
    const [row] = await state.db
      .insert(state.dbModule.communities)
      .values({
        name: `Starter pack ${label} ${state.runSuffix}`,
        slug: `starter-pack-${label}-${state.runSuffix}`,
        communityType: 'condo_718',
        timezone: 'America/New_York',
      })
      .returning({ id: state.dbModule.communities.id });
    if (!row) throw new Error(`Failed to create community "${label}"`);
    trackCommunityForCleanup(state, row.id);
    return row.id;
  }

  async function liveBlockCount(communityId: number): Promise<number> {
    if (!state) throw new Error('Not initialized');
    const { siteBlocks } = state.dbModule;
    const rows = await state.db
      .select({ id: siteBlocks.id })
      .from(siteBlocks)
      .where(and(eq(siteBlocks.communityId, communityId), isNull(siteBlocks.deletedAt)));
    return rows.length;
  }

  async function condoPackSize(): Promise<number> {
    if (!state) throw new Error('Not initialized');
    const { siteStarterPacks } = state.dbModule;
    const [pack] = await state.db
      .select({ blocks: siteStarterPacks.blocks })
      .from(siteStarterPacks)
      .where(and(eq(siteStarterPacks.communityType, 'condo_718'), eq(siteStarterPacks.isArchived, false)));
    return Array.isArray(pack?.blocks) ? pack.blocks.length : 0;
  }

  beforeAll(async () => {
    state = await initTestKit();
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('applies the pack once when applies race, and publishes a draft home page', async () => {
    if (!state) throw new Error('Not initialized');
    const packSize = await condoPackSize();
    expect(packSize).toBeGreaterThan(0);
    const communityId = await createCommunity('race');
    // A community whose editor was opened before it had a site: the first editor
    // load created a draft home page with nothing on it.
    await ensureHomePage(communityId);

    // The section-order unique index already stops a second pack landing, but
    // only by failing the losing apply. The row lock makes every racer succeed.
    const results = await Promise.all([
      applyStarterPackToCommunity(communityId, 'condo_718'),
      applyStarterPackToCommunity(communityId, 'condo_718'),
      applyStarterPackToCommunity(communityId, 'condo_718'),
    ]);

    expect(results.filter((r) => r.applied)).toHaveLength(1);
    expect(await liveBlockCount(communityId)).toBe(packSize);
    const { sitePages } = state.dbModule;
    const pages = await state.db
      .select({ isHome: sitePages.isHome, isDraft: sitePages.isDraft })
      .from(sitePages)
      .where(eq(sitePages.communityId, communityId));
    expect(pages).toEqual([{ isHome: true, isDraft: false }]);

    // The site is live, so the community reads as published, stamped exactly
    // as `publishCommunitySite` and migration 0043 stamp it: the live blocks'
    // MAX(published_at).
    const { communities, siteBlocks } = state.dbModule;
    const blockStamps = await state.db
      .select({ publishedAt: siteBlocks.publishedAt })
      .from(siteBlocks)
      .where(and(eq(siteBlocks.communityId, communityId), isNull(siteBlocks.deletedAt)));
    const maxBlockStamp = Math.max(...blockStamps.map((b) => b.publishedAt?.getTime() ?? 0));
    const [community] = await state.db
      .select({ sitePublishedAt: communities.sitePublishedAt })
      .from(communities)
      .where(eq(communities.id, communityId));
    expect(community?.sitePublishedAt?.getTime()).toBe(maxBlockStamp);
  });
});
