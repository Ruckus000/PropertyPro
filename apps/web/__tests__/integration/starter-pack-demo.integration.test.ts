/**
 * Starter sections for demo communities, applied on demo entry.
 *
 * The admin preview opens the board and resident demo links together, so two
 * first entries race. Only real Postgres shows whether the community row lock
 * keeps the pack from landing twice; a mock cannot.
 *
 * Nothing is mocked — no-mock-guard forbids it under __tests__/integration/.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  applyStarterPackToCommunity,
  applyStarterPackToDemoCommunity,
} from '@/lib/services/starter-pack-service';
import { ensureHomePage } from '@/lib/services/site-pages-service';
import {
  type TestKitState,
  initTestKit,
  teardownTestKit,
  trackCommunityForCleanup,
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Demo starter pack integration tests');

const describeDb = getDescribeDb();

describeDb('demo starter sections (db-backed integration)', () => {
  let state: TestKitState | null = null;
  const inAWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  async function createCommunity(label: string, isDemo: boolean): Promise<number> {
    if (!state) throw new Error('Not initialized');
    const [row] = await state.db
      .insert(state.dbModule.communities)
      .values({
        name: `Starter pack ${label} ${state.runSuffix}`,
        slug: `starter-pack-${label}-${state.runSuffix}`,
        communityType: 'condo_718',
        timezone: 'America/New_York',
        isDemo,
        // enforce_demo_timestamps: a demo carries both.
        ...(isDemo ? { trialEndsAt: inAWeek(), demoExpiresAt: inAWeek() } : {}),
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

  it('applies the pack once when entries race, and publishes a draft home page', async () => {
    if (!state) throw new Error('Not initialized');
    const packSize = await condoPackSize();
    expect(packSize).toBeGreaterThan(0);
    const communityId = await createCommunity('race', true);
    // A demo whose editor was opened before demos got starter sections: the
    // first editor load created a draft home page with nothing on it.
    await ensureHomePage(communityId);

    // Called directly, not through the demo wrapper, which swallows errors: the
    // section-order unique index already stops a second pack landing, but only
    // by failing the losing entry. The row lock makes every racer succeed.
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
  });

  it('keeps a demo site the prospect emptied empty', async () => {
    if (!state) throw new Error('Not initialized');
    const communityId = await createCommunity('emptied', true);
    await applyStarterPackToDemoCommunity(communityId);
    expect(await liveBlockCount(communityId)).toBeGreaterThan(0);
    // Removing a section soft-deletes it (removeSiteBlock).
    const { siteBlocks } = state.dbModule;
    await state.db.update(siteBlocks).set({ deletedAt: new Date() }).where(eq(siteBlocks.communityId, communityId));

    await applyStarterPackToDemoCommunity(communityId);

    expect(await liveBlockCount(communityId)).toBe(0);
  });

  it('leaves a community that is not a demo alone', async () => {
    const communityId = await createCommunity('real', false);
    await applyStarterPackToDemoCommunity(communityId);
    expect(await liveBlockCount(communityId)).toBe(0);
  });
});
