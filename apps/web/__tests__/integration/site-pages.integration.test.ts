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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  unstageSitePageDelete,
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

  it('no longer admits a block without a page_id at all', async () => {
    /*
     * This case used to assert ADOPTION: the pre-11b deploy wrote rows with
     * `page_id` NULL, and `ensureHomePage` healed them onto the home page. It
     * simulated the row with a direct insert "because no service can produce
     * that row any more".
     *
     * As of migration 0048 the DATABASE cannot produce it either — `page_id` is
     * NOT NULL — so the state the old case set up is unrepresentable and the
     * assertion it made is unreachable. Rewritten to assert the stronger fact
     * that replaced it rather than deleted, because "NULLs can no longer occur"
     * is exactly what 11c bought and is worth a standing guard.
     *
     * `adoptPagelessBlocks` itself is deliberately KEPT in the service: this
     * code deploys before 0048 is applied by hand, so there is a window where
     * production still has nullable `page_id`. It becomes dead only once the
     * migration is confirmed applied.
     */
    const communityId = await createCommunity('no-null-page');
    if (!state) throw new Error('Not initialized');

    // Asserted on the DRIVER error, not the message: drizzle wraps the failure
    // as "Failed query: …", so matching the text would pass for any broken
    // statement. `23502` is Postgres' not_null_violation and nothing else.
    const error = await state.db
      .execute(
        sql`INSERT INTO site_blocks (community_id, block_type, block_order, content, is_draft)
            VALUES (${communityId}, 'hero', 1, '{}'::jsonb, false)`,
      )
      .then(
        () => null,
        (e: unknown) => e as { cause?: { code?: string }; code?: string } | null,
      );
    expect(error).not.toBeNull();
    expect(error?.cause?.code ?? error?.code).toBe('23502');

    // …and the ordinary path still produces a published home page for a
    // community whose blocks are published, which is what the old case's
    // second half was really protecting.
    const homePageId = await ensureHomePage(communityId);
    expect(homePageId).toBeGreaterThan(0);
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

  it('lets two pages hold the same slot — the point of the phase', async () => {
    /*
     * Inverted by migration 0048, and this is what 11c is FOR.
     *
     * Through 11b this refused with a readable 400, because the community-wide
     * 3-column index made the second write a unique violation and an opaque 500
     * was worse than a refusal. 0048 dropped that index: uniqueness is now
     * (community, page, block_order, is_draft), so page 2's section at slot 7
     * is simply a different row from page 1's.
     *
     * `assertSlotFreeAcrossPages` was DELETED rather than relaxed, as its own
     * comment instructed — a relaxed version would still be a read-then-write
     * guard protecting an invariant that no longer exists.
     */
    const communityId = await createCommunity('slot-shared-across-pages');
    const homePageId = await ensureHomePage(communityId);
    const about = await createSitePage({
      communityId, actorUserId, name: 'About', slug: 'about',
    });
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'text', blockOrder: 7, content: { body: 'Home seven' }, isDraft: true,
    });

    await upsertPublishedBlock({
      communityId, actorUserId, pageId: about.id,
      blockType: 'text', blockOrder: 7, content: { body: 'About seven' }, isDraft: true,
    });

    const atSeven = (await liveBlocks(communityId)).filter((b) => b.blockOrder === 7);
    expect(atSeven).toHaveLength(2);
    expect(new Set(atSeven.map((b) => b.pageId))).toEqual(new Set([homePageId, about.id]));
  });

  it('lets the SAME page overwrite its own slot (the guard is cross-page only)', async () => {
    const communityId = await createCommunity('slot-same-page');
    const homePageId = await ensureHomePage(communityId);
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'text', blockOrder: 8, content: { body: 'First' }, isDraft: true,
    });
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'text', blockOrder: 8, content: { body: 'Second' }, isDraft: true,
    });
    const drafts = (await liveBlocks(communityId)).filter((b) => b.isDraft && b.blockOrder === 8);
    expect(drafts).toHaveLength(1);
  });

  it('does not confuse a published row with a draft one at the same slot', async () => {
    // Writing a draft over a published slot on the SAME page is the normal edit
    // flow and must not be refused.
    //
    // This comment used to read "the guard matches on is_draft too, or [this]
    // would be refused". That was a FALSE PREMISE, and it is what hid the hole
    // the next case now covers: both writes below carry the SAME pageId, and the
    // guard discriminates on pageId, so this passes whether or not the query
    // filters on is_draft. The is_draft filter was never what made this work —
    // it only ever hid cross-page clashes between the two layers (D-SLOT).
    const communityId = await createCommunity('slot-draft-vs-published');
    const homePageId = await ensureHomePage(communityId);
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'text', blockOrder: 9, content: { body: 'Live' }, isDraft: false,
    });
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'text', blockOrder: 9, content: { body: 'Edited' }, isDraft: true,
    });
    const atNine = (await liveBlocks(communityId)).filter((b) => b.blockOrder === 9);
    expect(atNine).toHaveLength(2);
  });

  it('accepts the cross-LAYER pair that used to poison the next publish', async () => {
    /*
     * D-SLOT's worst case, now legal.
     *
     * Page A published at slot 12, page B drafting at slot 12. Under the
     * 3-column index these two rows did not collide on insert (they differ on
     * is_draft) but WOULD collide at publish, when every draft is promoted in
     * one transaction — producing two live rows at slot 12, rolling the whole
     * publish back, and leaving the community unable to publish anything. The
     * service refused the write up front to keep that recoverable.
     *
     * 0048 removes the collision entirely: after promotion the two rows differ
     * on page_id, which the 4-column index counts. So the write is accepted AND
     * the publish that follows it succeeds — which is the half worth asserting,
     * because "the insert no longer throws" alone would not prove the poisoning
     * is gone.
     */
    const communityId = await createCommunity('slot-cross-layer');
    const homePageId = await ensureHomePage(communityId);
    const about = await createSitePage({
      communityId, actorUserId, name: 'About', slug: 'about',
    });

    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'text', blockOrder: 12, content: { body: 'Home twelve, live' }, isDraft: false,
    });
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: about.id,
      blockType: 'text', blockOrder: 12, content: { body: 'About twelve, draft' }, isDraft: true,
    });

    // The publish that the old index would have rolled back.
    await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null });

    const atTwelve = (await liveBlocks(communityId)).filter(
      (b) => b.blockOrder === 12 && !b.isDraft,
    );
    expect(atTwelve).toHaveLength(2);
    expect(new Set(atTwelve.map((b) => b.pageId))).toEqual(new Set([homePageId, about.id]));
  });

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

  it('counts the pages a publish added and removed, so the receipt can say what happened', async () => {
    /*
     * A publish can consist ENTIRELY of page changes, and the result reported
     * neither. A created page with no sections promotes zero blocks; a staged
     * removal deletes the page, its sections and its slug history through a
     * loop `retiredCount` does not count. Both came back
     * `{ promotedCount: 0, retiredCount: 0 }`, so the toast — the only record
     * the PM gets, since the sheet closes on success — read
     * "Published — 0 sections live." for the most irreversible thing this phase
     * ships.
     *
     * Asserted here rather than only in the component test because the counts
     * are a property of the TRANSACTION: `removedPageCount` comes from the loop
     * that soft-deletes, and `addedPageCount` from rows read before any of the
     * transaction's own writes. A mocked result would assert the fixture.
     *
     * Revert check (production line): `addedPageCount` / `removedPageCount` in
     * `publishCommunitySite`'s return.
     */
    const communityId = await createCommunity('publish-page-counts');
    const homePageId = await ensureHomePage(communityId);
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'hero', blockOrder: 1, content: { headline: 'Live' }, isDraft: false,
    });

    // A page with NO sections on it: the case that promoted zero blocks and so
    // reported zero of everything.
    const empty = await createSitePage({
      communityId, actorUserId, name: 'Contact', slug: 'contact',
    });
    const added = await publishCommunitySite({
      communityId, actorUserId, expectedPublishedAt: null,
    });
    expect(added.published).toBe(true);
    if (!added.published) throw new Error('unreachable');
    expect(added.addedPageCount).toBe(1);
    expect(added.removedPageCount).toBe(0);
    // The lazily-created home page is NOT counted — it is an artefact of
    // `ensureHomePage`, not something this PM asked for, and counting it would
    // tell every first-time manager they had added a page they never made.
    expect(added.promotedCount).toBe(0);

    // Now the destructive half.
    await stageSitePageDelete({ communityId, actorUserId, pageId: empty.id });
    const removed = await publishCommunitySite({
      communityId, actorUserId, expectedPublishedAt: null,
    });
    expect(removed.published).toBe(true);
    if (!removed.published) throw new Error('unreachable');
    expect(removed.removedPageCount).toBe(1);
    expect(removed.addedPageCount).toBe(0);
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

  it('refuses a duplicate page name on the write, not on the next publish', async () => {
    // The editor runs the same rule client-side, but the pages API carries no
    // feature flag — `site_pages` shipped in 11a and any authenticated PM with
    // an HTTP client can reach it. Without a server rule, a duplicate name
    // saved cleanly and then blocked EVERY subsequent publish, because
    // `publishCommunitySite` runs `pageIssues` itself and throws — naming a
    // page the PM may never have touched. A write that quietly makes the site
    // unpublishable is refused at the write.
    const communityId = await createCommunity('duplicate-name');
    await ensureHomePage(communityId);
    const amenities = await createSitePage({
      communityId, actorUserId, name: 'Amenities', slug: 'amenities',
    });
    const board = await createSitePage({
      communityId, actorUserId, name: 'Board', slug: 'board',
    });

    // Both directions: the client bug was that only one of them was caught.
    await expect(
      updateSitePage({ communityId, actorUserId, pageId: amenities.id, name: 'Board' }),
    ).rejects.toThrow(ValidationError);
    await expect(
      updateSitePage({ communityId, actorUserId, pageId: board.id, name: 'Amenities' }),
    ).rejects.toThrow(ValidationError);

    // Case-insensitively: names are nav labels, so two differing only in case
    // are indistinguishable to a visitor.
    await expect(
      updateSitePage({ communityId, actorUserId, pageId: amenities.id, name: 'bOaRd' }),
    ).rejects.toThrow(ValidationError);

    // Creation is the same hole seen from the other side.
    await expect(
      createSitePage({ communityId, actorUserId, name: 'Board', slug: 'board-2' }),
    ).rejects.toThrow(ValidationError);

    // A page keeping its own name is not a clash with itself, and an unrelated
    // rename still works — the guard must not be a blanket refusal.
    const renamed = await updateSitePage({
      communityId, actorUserId, pageId: amenities.id, name: 'Amenities',
    });
    expect(renamed.page.name).toBe('Amenities');
    const moved = await updateSitePage({
      communityId, actorUserId, pageId: amenities.id, name: 'Amenity guide',
    });
    expect(moved.page.name).toBe('Amenity guide');
  });

  it('frees a staged page\'s name for reuse before the publish lands', async () => {
    // Staging is what releases the name — that is the rule `pageIssues` already
    // applies client-side (`live = pages.filter(p => !p.deleteStaged)`) and the
    // one the Pages panel documents. A server gate that counted staged pages
    // would be STRICTER than the invariant it protects: `publishCommunitySite`
    // runs `pageIssues`, so it would publish this state happily, while the PM
    // was told the name is taken by a page they had already marked for
    // deletion. The only escape would be publishing that deletion — which also
    // ships every other pending draft.
    const communityId = await createCommunity('staged-name-reuse');
    const homePageId = await ensureHomePage(communityId);
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'hero', blockOrder: 1, content: { headline: 'Live' }, isDraft: false,
    });
    const events = await createSitePage({
      communityId, actorUserId, name: 'Events', slug: 'events',
    });
    // Published, so the removal STAGES rather than deleting outright — the row
    // is still present and still `deletedAt IS NULL` while staged.
    await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null });
    const staged = await stageSitePageDelete({
      communityId, actorUserId, pageId: events.id,
    });
    expect(staged).toEqual({ staged: true });

    const replacement = await createSitePage({
      communityId, actorUserId, name: 'Events', slug: 'events-2026',
    });
    expect(replacement.name).toBe('Events');
  });

  /*
   * These two are REGRESSION tests for the lock-free refactor, not proof of it.
   * Both pass with the fast path deleted — verified by reverting. What they pin
   * is that the refactor changed no ANSWER: both branches return the same pages,
   * and the lazy ensure still seeds home exactly once.
   *
   * An earlier version of this comment said the lock removal "cannot be
   * observed" through the service API. That was wrong, and wrong in a
   * self-serving direction — it turned an admission into a justification. A
   * second connection observes it directly: hold
   * `SELECT id FROM communities WHERE id = $1 FOR UPDATE` open on one, and
   * `listSitePages` on another resolves now where it would previously have
   * blocked.
   *
   * That test now exists — see the `the community lock` describe below, which
   * holds `FOR UPDATE` on one connection and races the read on another. These
   * two remain answer-regression tests; the lock itself is pinned there.
   */
  it('creates the home page on a community that has none, and reads without doing so afterwards', async () => {
    const communityId = await createCommunity('lazy-ensure');

    // No pages yet: the slow branch runs and seeds home.
    const first = await listSitePages(communityId, { includeDrafts: true });
    expect(first).toHaveLength(1);
    expect(first[0]?.isHome).toBe(true);

    // Now the fast branch. Same answer, and it must not create a second home —
    // which is also what would happen if the emptiness check were wrong.
    const second = await listSitePages(communityId, { includeDrafts: true });
    expect(second).toHaveLength(1);
    expect(second[0]?.id).toBe(first[0]?.id);
  });

  it('does not re-run the ensure for a community whose only page is a DRAFT home', async () => {
    // The landmine the unfiltered read exists to avoid. A community that has
    // never published has a draft home, so deciding the fast path on an
    // `includeDrafts: false` read would come back empty and take the lock on
    // EVERY call — for exactly the communities most likely to be new. Both
    // current callers pass `includeDrafts: true`, so this would have sat unnoticed.
    //
    // Same caveat as above: this pins the ANSWER (a filtered view being empty
    // must not provoke a second home page), not the lock behaviour.
    const communityId = await createCommunity('draft-home-only');
    const homePageId = await ensureHomePage(communityId);

    const publishedOnly = await listSitePages(communityId, { includeDrafts: false });
    expect(publishedOnly).toEqual([]);

    // The draft home is still there and still the only page — the filtered view
    // being empty must not have provoked a second one.
    const all = await listSitePages(communityId, { includeDrafts: true });
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(homePageId);
    expect(all[0]?.isDraft).toBe(true);
  });

  it('re-creates home for a community that has pages but no HOME page', async () => {
    /*
     * The fast-path guard is `existing.some((p) => p.isHome)`, not
     * `existing.length > 0`, and until now nothing tested the difference:
     * reverting it to `length > 0` broke no test at all.
     *
     * The two coincide only while home is undeletable, which is a property of
     * today's write paths rather than of the data. A community with pages and
     * no home short-circuits forever under `length > 0` — `listSitePages`
     * keeps answering "nothing to do", `EditorRoot` falls through to
     * `pages?.[0]`, and every block write is scoped to a NON-home page while
     * the public root serves nothing. The function's promise is "a home page
     * exists", so that is what the guard has to check.
     *
     * The state is reached by soft-deleting the home row directly, which is
     * the honest way to build a state no service will produce — a restored
     * backup or a raw SQL fix is exactly how it would arise in production.
     */
    if (!state) throw new Error('Not initialized');
    const communityId = await createCommunity('home-less');
    const originalHomeId = await ensureHomePage(communityId);
    await createSitePage({
      communityId,
      actorUserId,
      name: 'Amenities',
      slug: 'amenities',
    });

    await state.db
      .update(state.dbModule.sitePages)
      .set({ deletedAt: new Date() })
      .where(eq(state.dbModule.sitePages.id, originalHomeId));

    // Precondition read straight from the table, NOT through `listSitePages` —
    // that call is the thing under test and would repair the state before the
    // assertion could observe it.
    const before = await state.db
      .select({
        id: state.dbModule.sitePages.id,
        isHome: state.dbModule.sitePages.isHome,
      })
      .from(state.dbModule.sitePages)
      .where(
        and(
          eq(state.dbModule.sitePages.communityId, communityId),
          isNull(state.dbModule.sitePages.deletedAt),
        ),
      );
    expect(before.length).toBeGreaterThan(0);
    expect(before.some((p) => p.isHome)).toBe(false);

    const after = await listSitePages(communityId, { includeDrafts: true });
    const homes = after.filter((p) => p.isHome);
    expect(homes).toHaveLength(1);
    expect(homes[0]?.id).not.toBe(originalHomeId);
    // And the non-home page is untouched — the repair adds, it does not rebuild.
    expect(after.some((p) => p.slug === 'amenities')).toBe(true);
  });

  /*
   * The lock-free fast path, asserted directly.
   *
   * The two cases above pin that no ANSWER changed and pass with the fast path
   * deleted — which is honest but leaves the actual property untested. It IS
   * observable, with two connections: hold `FOR UPDATE` on the community row,
   * then see whether a pages read comes back.
   *
   * `listSitePages` opens its own client via `createUnscopedClient()`, so it
   * contends with `state.sqlClient` rather than sharing its pool.
   *
   * Neither case can hang CI: every wait is raced against a timer, the lock is
   * released in a `finally`, and the outstanding promise is always awaited
   * afterwards so nothing is left dangling.
   */
  describe('the community lock', () => {
    const WAIT_MS = 2_000;

    /**
     * Holds `SELECT … FOR UPDATE` on one connection for the duration of `body`.
     * The transaction is always ended, even if `body` throws.
     */
    async function whileCommunityRowLocked<T>(
      communityId: number,
      body: () => Promise<T>,
    ): Promise<T> {
      if (!state) throw new Error('Not initialized');
      let release!: () => void;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      // Hand-rolled rather than `Promise.withResolvers` — the repo runs Node 20
      // (.nvmrc), where that is not available.
      let signalAcquired!: () => void;
      const acquired = new Promise<void>((resolve) => {
        signalAcquired = resolve;
      });

      const held = state.sqlClient
        .begin(async (tx) => {
          // postgres.js declares `TransactionSql` as `Omit<Sql, …>`, and `Omit`
          // is a mapped type, which drops call signatures — so the transaction
          // handle has no tagged-template form even though at runtime it is the
          // same callable object. `unsafe` survives the `Omit`, and is the idiom
          // the rest of this file already uses; `communityId` is a number this
          // test allocates, not external input.
          await tx.unsafe(`SELECT id FROM communities WHERE id = ${communityId} FOR UPDATE`);
          signalAcquired();
          await released;
        })
        // Swallow here so a transaction failure surfaces as the body's timeout
        // rather than as an unhandled rejection in an unrelated test.
        .catch(() => signalAcquired());

      await acquired;
      try {
        return await body();
      } finally {
        release();
        await held;
      }
    }

    /** Resolves `{ settled: false }` rather than hanging. */
    async function settlesWithin<T>(
      promise: Promise<T>,
      ms: number,
    ): Promise<{ settled: boolean }> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), ms);
      });
      // The promise is awaited by the caller either way; this only observes it.
      const outcome = await Promise.race([promise.then(() => 'settled' as const), timeout]);
      if (timer) clearTimeout(timer);
      return { settled: outcome === 'settled' };
    }

    it('does not block a pages read on a community that already has a home page', async () => {
      const communityId = await createCommunity('lock-fast-path');
      await ensureHomePage(communityId);

      // The read is handed OUT of the locked section rather than awaited inside
      // it. Awaiting a blocked read in there would deadlock — the `finally` that
      // releases the lock cannot run until the body returns — and vitest's
      // default timeout killing a held transaction is precisely the failure mode
      // this harness exists to avoid.
      const { outcome, read } = await whileCommunityRowLocked(communityId, async () => {
        const pending = listSitePages(communityId, { includeDrafts: true });
        return { outcome: await settlesWithin(pending, WAIT_MS), read: pending };
      });

      const pages = await read;
      expect(pages).toHaveLength(1);

      expect(
        outcome.settled,
        `listSitePages blocked for ${WAIT_MS}ms while another transaction held the ` +
          'community row. The fast path should not take that lock — every editor ' +
          'load and every pages refetch goes through here.',
      ).toBe(true);
    });

    it('DOES block when the community has no home page yet, because that branch writes', async () => {
      // The positive control, and the reason the case above means anything: it
      // proves this harness can actually detect blocking. Without it, "resolved
      // quickly" would also be what a broken lock-holder produced.
      const communityId = await createCommunity('lock-slow-path');

      const { outcome, read } = await whileCommunityRowLocked(communityId, async () => {
        const pending = listSitePages(communityId, { includeDrafts: true });
        return { outcome: await settlesWithin(pending, WAIT_MS), read: pending };
      });

      expect(
        outcome.settled,
        'A community with no pages must take the lock: that branch creates the ' +
          'home page, and two concurrent first-touches would race find-then-insert.',
      ).toBe(false);

      // Released now, so it completes — and correctly.
      const pages = await read;
      expect(pages).toHaveLength(1);
      expect(pages[0]?.isHome).toBe(true);
    });
  });

  it('refuses to CANCEL a removal when the name has since been taken', async () => {
    // The other side of freeing the name, and the hole freeing it opened.
    // "Cancel removal" is always offered and has no time limit, so without a
    // re-check the sequence stage → create replacement → cancel leaves two live
    // pages under one name. Nothing downstream stops it: `publishCommunitySite`
    // runs `pageIssues`, which errors on the duplicate, so EVERY later publish
    // is blocked — and the PM is told a name clashes right after doing
    // something they think of as an undo.
    //
    // The clash cannot exist until the replacement is created, which is why the
    // check belongs here and not at staging time.
    const communityId = await createCommunity('unstage-name-clash');
    const homePageId = await ensureHomePage(communityId);
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'hero', blockOrder: 1, content: { headline: 'Live' }, isDraft: false,
    });
    const events = await createSitePage({
      communityId, actorUserId, name: 'Events', slug: 'events',
    });
    await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null });
    await stageSitePageDelete({ communityId, actorUserId, pageId: events.id });
    await createSitePage({ communityId, actorUserId, name: 'Events', slug: 'events-2026' });

    await expect(
      unstageSitePageDelete({ communityId, actorUserId, pageId: events.id }),
    ).rejects.toThrow(ValidationError);

    // Still staged — a refused cancel must not half-apply.
    const pages = await listSitePages(communityId, { includeDrafts: true });
    expect(pages.find((p) => p.id === events.id)?.deleteStagedAt).not.toBeNull();
  });

  it('still cancels a removal when nothing took the name', async () => {
    // The guard must not make every cancel fail — the ordinary undo still works.
    const communityId = await createCommunity('unstage-clean');
    const homePageId = await ensureHomePage(communityId);
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'hero', blockOrder: 1, content: { headline: 'Live' }, isDraft: false,
    });
    const events = await createSitePage({
      communityId, actorUserId, name: 'Events', slug: 'events',
    });
    await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null });
    await stageSitePageDelete({ communityId, actorUserId, pageId: events.id });

    const restored = await unstageSitePageDelete({
      communityId, actorUserId, pageId: events.id,
    });
    expect(restored.deleteStagedAt).toBeNull();
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

  it('reverts a slot that changed page ownership since the snapshot', async () => {
    /*
     * Inverted by Phase 11c (migration 0048), and this is the user-visible
     * payoff of the whole phase.
     *
     * Through the 11a->11c window this REFUSED. Both the restore and the
     * staged-removal insert write is_draft=true rows, and the community-wide
     * 3-column index meant "restore order 3 to page A" and "stage removal of
     * order 3 on page B" could not both be expressed — so the service refused
     * with a readable message rather than letting a raw unique violation
     * surface as a 500.
     *
     * 0048 dropped that index. Both rows are now legal simultaneously because
     * uniqueness is per (page, order), so the refusal became a FALSE one — it
     * would block ordinary reverts of any multi-page site. The guard was
     * deleted rather than relaxed, exactly as its own comment instructed.
     */
    const communityId = await createCommunity('revert-slot-moved');
    const homePageId = await ensureHomePage(communityId);
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: homePageId,
      blockType: 'hero', blockOrder: 1, content: { headline: 'Live' }, isDraft: false,
    });
    const about = await createSitePage({
      communityId, actorUserId, name: 'About', slug: 'about',
    });
    await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null });
    // The live site now publishes order 3 on the About page.
    await upsertPublishedBlock({
      communityId, actorUserId, pageId: about.id,
      blockType: 'text', blockOrder: 3, content: { body: 'About three' }, isDraft: false,
    });
    if (!state) throw new Error('Not initialized');

    // A snapshot in which order 3 belonged to HOME.
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
            { pageId: homePageId, name: 'Home', slug: '', inNav: true, sortOrder: 0, isHome: true },
          ],
          blocks: [
            { pageId: homePageId, blockOrder: 3, blockType: 'text', content: { body: 'Home three' } },
          ],
        },
      })
      .returning({ id: state.dbModule.sitePublishSnapshots.id });
    if (!snapshotRow) throw new Error('Failed to seed snapshot');

    const result = await revertToSnapshot({
      communityId,
      actorUserId,
      snapshotId: snapshotRow.id,
    });

    // The snapshot's order-3 section is restored to HOME as a draft, while the
    // live About page keeps its own order 3. Same slot, two pages, both fine.
    expect(result.restoredCount).toBe(1);
    const drafts = (await liveBlocks(communityId)).filter((b) => b.isDraft);
    const restoredOnHome = drafts.find(
      (b) => b.pageId === homePageId && b.blockOrder === 3,
    );
    expect(restoredOnHome).toBeDefined();
    const published = (await liveBlocks(communityId)).filter((b) => !b.isDraft);
    expect(published.some((b) => b.pageId === about.id && b.blockOrder === 3)).toBe(true);
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
