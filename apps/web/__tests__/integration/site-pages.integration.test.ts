/**
 * Multi-page site — pages, publish isolation, staged removal, revert tolerance.
 *
 * Phase 11b-1. These are properties of the TRANSACTION and of the DB
 * constraints, so none of them survives being mocked: the composite
 * `(community_id, page_id)` foreign keys, the surviving 3-column ordering index,
 * the cross-page publish predicate, and the v1→v2 snapshot payload migration all
 * need real Postgres.
 *
 * Nothing is mocked — no-mock-guard forbids it under __tests__/integration/, and
 * none of it is needed: the services are called directly and auth comes from the
 * shared provider `initTestKit` registers.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { ValidationError } from '@/lib/api/errors';
import {
  publishCommunitySite,
  revertToSnapshot,
  upsertPublishedBlock,
} from '@/lib/services/site-blocks-service';
import {
  createSitePage,
  ensureHomePage,
  listSitePages,
  stageSitePageDelete,
  updateSitePage,
} from '@/lib/services/site-pages-service';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  initTestKit,
  seedCommunities,
  seedUsers,
  teardownTestKit,
  trackCommunityForCleanup,
  requireCommunity,
  requireUser,
  setActor,
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Multi-page site integration tests');

const describeDb = getDescribeDb();

describeDb('multi-page site (db-backed integration)', () => {
  let state: TestKitState | null = null;
  let actorUserId: string;

  async function createCommunity(label: string): Promise<number> {
    if (!state) throw new Error('Not initialized');
    const [row] = await state.db
      .insert(state.dbModule.communities)
      .values({
        name: `Site pages ${label} ${state.runSuffix}`,
        slug: `site-pages-${label}-${state.runSuffix}`,
        communityType: 'condo_718',
        timezone: 'America/New_York',
      })
      .returning({ id: state.dbModule.communities.id });
    if (!row) throw new Error(`Failed to create community "${label}"`);
    trackCommunityForCleanup(state, row.id);
    return row.id;
  }

  interface BlockRow {
    id: number;
    pageId: number | null;
    blockOrder: number;
    blockType: string;
    isDraft: boolean;
  }

  async function liveBlocks(communityId: number): Promise<BlockRow[]> {
    if (!state) throw new Error('Not initialized');
    const rows = await state.db
      .select({
        id: state.dbModule.siteBlocks.id,
        pageId: state.dbModule.siteBlocks.pageId,
        blockOrder: state.dbModule.siteBlocks.blockOrder,
        blockType: state.dbModule.siteBlocks.blockType,
        isDraft: state.dbModule.siteBlocks.isDraft,
      })
      .from(state.dbModule.siteBlocks)
      .where(
        and(
          eq(state.dbModule.siteBlocks.communityId, communityId),
          isNull(state.dbModule.siteBlocks.deletedAt),
        ),
      );
    return [...rows].sort(
      (a, b) => (a.pageId ?? 0) - (b.pageId ?? 0) || a.blockOrder - b.blockOrder,
    );
  }

  beforeAll(async () => {
    state = await initTestKit();
    await seedCommunities(state, MULTI_TENANT_COMMUNITIES);
    await seedUsers(state, MULTI_TENANT_USERS);
    setActor(state, 'actorA');
    actorUserId = requireUser(state, 'actorA').id;

    // `site_publish_snapshots.actor_user_id` FKs to `auth.users`, which the shared
    // kit does not seed (it writes `public.users` only). Real signups always have
    // both rows; the local test DB starts with an empty auth schema. Same mirror
    // the publish-snapshot suite uses.
    await state.db.execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${actorUserId}::uuid, ${`site-pages-${state.runSuffix}@example.com`}) ON CONFLICT (id) DO NOTHING`,
    );

    // Touch the fixture community so an unused-import lint never masks a real
    // wiring break in the kit.
    expect(requireCommunity(state, 'communityA')).toBeTruthy();
  });

  afterAll(async () => {
    if (!state) return;
    // Drop the mirrored auth row before the kit deletes public.users.
    await state.db.execute(sql`DELETE FROM auth.users WHERE id = ${actorUserId}::uuid`);
    await teardownTestKit(state);
  });

  // -------------------------------------------------------------------------
  // ensureHomePage
  // -------------------------------------------------------------------------

  it('creates exactly one home page and is idempotent under repeat calls', async () => {
    const communityId = await createCommunity('home-once');

    const first = await ensureHomePage(communityId);
    const second = await ensureHomePage(communityId);

    expect(second).toBe(first);
    const pages = await listSitePages(communityId, { includeDrafts: true });
    expect(pages.filter((p) => p.isHome)).toHaveLength(1);
    expect(pages[0]).toMatchObject({ isHome: true, slug: '', sortOrder: 0 });
  });

  it('adopts blocks written without a page_id', async () => {
    // The rollout window: the pre-11b deploy writes rows with page_id NULL, and
    // every one left behind is a failed 11c `SET NOT NULL`. Simulated with a
    // direct insert because no service can produce that row any more.
    const communityId = await createCommunity('adopt');
    if (!state) throw new Error('Not initialized');
    await state.db.insert(state.dbModule.siteBlocks).values({
      communityId,
      blockOrder: 1,
      blockType: 'hero',
      content: { headline: 'Legacy row' },
      isDraft: false,
      publishedAt: new Date('2026-06-01T00:00:00Z'),
    });

    const homePageId = await ensureHomePage(communityId);

    const blocks = await liveBlocks(communityId);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.pageId).toBe(homePageId);
    // A community whose blocks are already published must get a PUBLISHED home
    // page — a draft one would be hidden by anon RLS while its content was served.
    const pages = await listSitePages(communityId, { includeDrafts: true });
    expect(pages[0]).toMatchObject({ isDraft: false });
  });

  // -------------------------------------------------------------------------
  // Constraints that only exist in the database
  // -------------------------------------------------------------------------

  it('refuses a block whose page belongs to another community', async () => {
    // The composite (community_id, page_id) FK. Without it, and given the
    // ON DELETE cascade, deleting community B's page would delete community A's
    // blocks — a cross-tenant destructive path.
    const a = await createCommunity('fk-a');
    const b = await createCommunity('fk-b');
    await ensureHomePage(a);
    const foreignPageId = await ensureHomePage(b);
    if (!state) throw new Error('Not initialized');

    await expect(
      state.db.insert(state.dbModule.siteBlocks).values({
        communityId: a,
        pageId: foreignPageId,
        blockOrder: 5,
        blockType: 'text',
        content: { body: 'x' },
        isDraft: true,
      }),
    ).rejects.toThrow();
  });

  it('still forbids two pages sharing a (block_order, is_draft) until 11c', async () => {
    // The surviving 3-column index is STRICTER than the new 4-column one, so
    // block_order stays community-wide for the whole of 11b. This is the
    // assertion that defines what gate G3 unlocks: when 11c drops that index,
    // this expectation flips.
    const communityId = await createCommunity('slot-budget');
    const homePageId = await ensureHomePage(communityId);
    const about = await createSitePage({
      communityId, actorUserId, name: 'About', slug: 'about',
    });

    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'text', blockOrder: 4, content: { body: 'Home four' }, isDraft: true,
    });

    await expect(
      upsertPublishedBlock({
        communityId, actorUserId, pageId: about.id,
        blockType: 'text', blockOrder: 4, content: { body: 'About four' }, isDraft: true,
      }),
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // Publish isolation across pages
  // -------------------------------------------------------------------------

  it('publishing a draft on one page does not retire another page\'s published row', async () => {
    // THE regression the (page, order) pair predicate exists for. Slots are
    // community-unique in 11b, so this is currently belt-and-braces — and it is
    // written now precisely so 11c's index drop cannot introduce the bug silently.
    const communityId = await createCommunity('publish-isolation');
    const homePageId = await ensureHomePage(communityId);
    const about = await createSitePage({
      communityId, actorUserId, name: 'About', slug: 'about',
    });

    // Home: hero + a published section. About: its own published section.
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'hero', blockOrder: 1, content: { headline: 'Live' }, isDraft: false,
    });
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'text', blockOrder: 2, content: { body: 'Home body' }, isDraft: false,
    });
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: about.id,
      blockType: 'text', blockOrder: 3, content: { body: 'About body' }, isDraft: false,
    });

    // Edit only the About section.
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: about.id,
      blockType: 'text', blockOrder: 3, content: { body: 'About body v2' }, isDraft: true,
    });

    const result = await publishCommunitySite({
      communityId, actorUserId, expectedPublishedAt: null,
    });
    expect(result).toMatchObject({ published: true, retiredCount: 1 });

    const published = (await liveBlocks(communityId)).filter((b) => !b.isDraft);
    // Home's two sections survive untouched; About has exactly one published row.
    expect(published.filter((b) => b.pageId === homePageId)).toHaveLength(2);
    expect(published.filter((b) => b.pageId === about.id)).toHaveLength(1);
  });

  it('promotes a never-published page on publish', async () => {
    const communityId = await createCommunity('promote-page');
    const homePageId = await ensureHomePage(communityId);
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'hero', blockOrder: 1, content: { headline: 'Live' }, isDraft: false,
    });
    const about = await createSitePage({
      communityId, actorUserId, name: 'About', slug: 'about',
    });
    expect(about.isDraft).toBe(true);

    // No block drafts at all — the page itself is the pending change.
    const result = await publishCommunitySite({
      communityId, actorUserId, expectedPublishedAt: null,
    });
    expect(result).toMatchObject({ published: true });

    const pages = await listSitePages(communityId, { includeDrafts: true });
    expect(pages.find((p) => p.id === about.id)).toMatchObject({ isDraft: false });
  });

  // -------------------------------------------------------------------------
  // Staged removal
  // -------------------------------------------------------------------------

  it('keeps a page staged for removal live until the publish that removes it', async () => {
    const communityId = await createCommunity('staged-delete');
    const homePageId = await ensureHomePage(communityId);
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'hero', blockOrder: 1, content: { headline: 'Live' }, isDraft: false,
    });
    const about = await createSitePage({
      communityId, actorUserId, name: 'About', slug: 'about',
    });
    await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null });
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: about.id,
      blockType: 'text', blockOrder: 2, content: { body: 'About body' }, isDraft: false,
    });

    const staged = await stageSitePageDelete({ communityId, actorUserId, pageId: about.id });
    expect(staged).toEqual({ staged: true });

    // STILL LIVE: this is the whole point of staging. A soft-delete on click would
    // have taken the page off the public site before the PM published.
    let pages = await listSitePages(communityId, { includeDrafts: true });
    expect(pages.find((p) => p.id === about.id)).toMatchObject({ deleteStagedAt: expect.any(Date) });
    expect((await liveBlocks(communityId)).some((b) => b.pageId === about.id)).toBe(true);

    await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null });

    pages = await listSitePages(communityId, { includeDrafts: true });
    expect(pages.find((p) => p.id === about.id)).toBeUndefined();
    expect((await liveBlocks(communityId)).some((b) => b.pageId === about.id)).toBe(false);
  });

  it('retires the removed page\'s slug history so its addresses are reusable', async () => {
    // Leaving the redirects live would forward visitors to a page that no longer
    // exists — a 404 with extra steps — and would keep every slug the page ever
    // held permanently unclaimable by any future page.
    const communityId = await createCommunity('delete-redirects');
    const homePageId = await ensureHomePage(communityId);
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'hero', blockOrder: 1, content: { headline: 'Live' }, isDraft: false,
    });
    const about = await createSitePage({
      communityId, actorUserId, name: 'About', slug: 'about',
    });
    await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null });
    await updateSitePage({ communityId, actorUserId, pageId: about.id, slug: 'about-us' });
    await stageSitePageDelete({ communityId, actorUserId, pageId: about.id });
    await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null });

    // The address the deleted page vacated is claimable again.
    const reused = await createSitePage({
      communityId, actorUserId, name: 'About v2', slug: 'about',
    });
    expect(reused.slug).toBe('about');
  });

  it('deletes a never-published page immediately, with its blocks', async () => {
    const communityId = await createCommunity('immediate-delete');
    const homePageId = await ensureHomePage(communityId);
    void homePageId;
    const draftPage = await createSitePage({
      communityId, actorUserId, name: 'Scratch', slug: 'scratch',
    });
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: draftPage.id,
      blockType: 'text', blockOrder: 6, content: { body: 'Scratch' }, isDraft: true,
    });

    const result = await stageSitePageDelete({ communityId, actorUserId, pageId: draftPage.id });

    expect(result).toEqual({ staged: false });
    const pages = await listSitePages(communityId, { includeDrafts: true });
    expect(pages.find((p) => p.id === draftPage.id)).toBeUndefined();
    // Soft-deleted explicitly: the composite FK cascade only fires on a HARD delete.
    expect((await liveBlocks(communityId)).some((b) => b.pageId === draftPage.id)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Renames and redirects
  // -------------------------------------------------------------------------

  it('mints a permanent redirect when a published page is renamed, and lets it be reclaimed', async () => {
    const communityId = await createCommunity('rename');
    const homePageId = await ensureHomePage(communityId);
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'hero', blockOrder: 1, content: { headline: 'Live' }, isDraft: false,
    });
    const about = await createSitePage({
      communityId, actorUserId, name: 'About', slug: 'about',
    });
    await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null });

    const renamed = await updateSitePage({
      communityId, actorUserId, pageId: about.id, slug: 'about-us',
    });
    expect(renamed.redirectedFrom).toBe('about');

    // A new page may NOT claim the retired address — every printed link to it
    // still forwards to the page that replaced it.
    await expect(
      createSitePage({ communityId, actorUserId, name: 'About again', slug: 'about' }),
    ).rejects.toThrow(ValidationError);

    // But the page that vacated it may take it back: that is an undo, not a hijack.
    const reclaimed = await updateSitePage({
      communityId, actorUserId, pageId: about.id, slug: 'about',
    });
    expect(reclaimed.page.slug).toBe('about');
  });

  it('refuses to publish when a page holds a slug reserved by an app route', async () => {
    // A community subdomain also serves the authenticated app, so `/documents`
    // would be shadowed forever. The publish gate re-checks on every publish
    // because the reserved list can GROW after a page was created.
    const communityId = await createCommunity('reserved');
    const homePageId = await ensureHomePage(communityId);
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'hero', blockOrder: 1, content: { headline: 'Live' }, isDraft: false,
    });
    const page = await createSitePage({
      communityId, actorUserId, name: 'Rules', slug: 'rules',
    });
    if (!state) throw new Error('Not initialized');
    // Written directly: the service would (correctly) refuse this slug, and the
    // case under test is a row that got there another way.
    await state.db
      .update(state.dbModule.sitePages)
      .set({ slug: 'documents' })
      .where(eq(state.dbModule.sitePages.id, page.id));

    await expect(
      publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null }),
    ).rejects.toThrow(ValidationError);
  });

  // -------------------------------------------------------------------------
  // Snapshot payload versions
  // -------------------------------------------------------------------------

  it('restores a pre-11b (v1) snapshot payload by attributing its blocks to home', async () => {
    // Production holds v1 rows. A publish history that stops working for anything
    // older than a deploy is not a history.
    const communityId = await createCommunity('v1-revert');
    const homePageId = await ensureHomePage(communityId);
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'hero', blockOrder: 1, content: { headline: 'Current' }, isDraft: false,
    });
    if (!state) throw new Error('Not initialized');

    // A v1 payload: no `version`, no `pages`, no `pageId` on the blocks.
    const [snapshotRow] = await state.db
      .insert(state.dbModule.sitePublishSnapshots)
      .values({
        communityId,
        publishedAt: new Date('2026-05-01T00:00:00Z'),
        actorUserId,
        changeCount: 1,
        changeLabels: ['Updated Hero'],
        snapshot: {
          blocks: [{ blockOrder: 1, blockType: 'hero', content: { headline: 'Old headline' } }],
        },
      })
      .returning({ id: state.dbModule.sitePublishSnapshots.id });
    if (!snapshotRow) throw new Error('Failed to seed v1 snapshot');

    const result = await revertToSnapshot({
      communityId, actorUserId, snapshotId: snapshotRow.id,
    });

    expect(result.restoredCount).toBe(1);
    const restored = (await liveBlocks(communityId)).filter((b) => b.isDraft);
    expect(restored).toHaveLength(1);
    expect(restored[0]!.pageId).toBe(homePageId);
  });

  it('refuses to restore a v2 snapshot naming a page that no longer exists', async () => {
    // Recreating the page is possible, but reclaiming a slug that now belongs to
    // someone else would silently redirect live traffic. A readable refusal beats
    // a half-applied revert.
    const communityId = await createCommunity('v2-missing-page');
    const homePageId = await ensureHomePage(communityId);
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'hero', blockOrder: 1, content: { headline: 'Current' }, isDraft: false,
    });
    if (!state) throw new Error('Not initialized');

    const missingPageId = homePageId + 999_999;
    const [snapshotRow] = await state.db
      .insert(state.dbModule.sitePublishSnapshots)
      .values({
        communityId,
        publishedAt: new Date('2026-05-01T00:00:00Z'),
        actorUserId,
        changeCount: 1,
        changeLabels: ['Updated Text'],
        snapshot: {
          version: 2,
          pages: [
            { pageId: missingPageId, name: 'Deleted page', slug: 'gone', inNav: true, sortOrder: 1, isHome: false },
          ],
          blocks: [
            { pageId: missingPageId, blockOrder: 3, blockType: 'text', content: { body: 'Old' } },
          ],
        },
      })
      .returning({ id: state.dbModule.sitePublishSnapshots.id });
    if (!snapshotRow) throw new Error('Failed to seed v2 snapshot');

    await expect(
      revertToSnapshot({ communityId, actorUserId, snapshotId: snapshotRow.id }),
    ).rejects.toThrow(/has since been deleted/);
  });
});
