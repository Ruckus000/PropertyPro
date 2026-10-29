/**
 * Looks against a real Postgres: a new community's suggested look, published at
 * creation, and a look switch written into the editor's draft layer and then
 * made live (or thrown away) by the editor's own Publish and Discard.
 *
 * The unit suite checks which statements run. These check what they leave
 * behind: the home page a visitor sees after Publish, the site's colours and
 * fonts, and that a switch leaves the live site alone until then.
 *
 * Nothing is mocked — no-mock-guard forbids it under __tests__/integration/.
 * Run with `pnpm test:integration:local`. NEVER against `.env.local`: that
 * DATABASE_URL is production.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { effectiveLook, liveLook, pendingLook, type CommunityBranding, type CommunityType } from '@propertypro/shared';
import { updateBrandingForCommunity } from '@/lib/api/branding';
import {
  discardSiteDrafts,
  publishCommunitySite,
  removeSiteBlock,
  upsertPublishedBlock,
} from '@/lib/services/site-blocks-service';
import { saveDraftDesign } from '@/lib/services/site-design-service';
import {
  applyLookAtCreation,
  draftLookSwitch,
  loadLookSwitchInput,
  withdrawDraftedLook,
} from '@/lib/services/site-look-service';
import { applyStarterPackToCommunity } from '@/lib/services/starter-pack-service';
import { getLook, planLookSwitch, planLookSwitchWithCounts, type LookId } from '@/lib/site-looks/looks';
import { resolveLookPreviewBranding } from '@/lib/public-site/preview-overrides';
import { SITE_LOOK_PRESETS } from '../fixtures/site-look-presets';
import {
  type TestKitState,
  initTestKit,
  teardownTestKit,
  trackCommunityForCleanup,
  trackUserForCleanup,
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Site look switch integration tests');

const describeDb = getDescribeDb();

interface Section {
  blockType: string;
  content: unknown;
}

const EDITED_HERO = {
  headline: 'Harbor Pointe',
  subtitle: 'Notices and records for Harbor Pointe owners.',
};

describeDb('site looks (db-backed integration)', () => {
  let state: TestKitState;
  let actorUserId: string;

  function lookSections(id: LookId): Section[] {
    const look = getLook(id);
    if (!look) throw new Error(`No look "${id}"`);
    return look.sections.map(({ blockType, content }) => ({ blockType, content }));
  }

  /** The branding a look writes: its layout and colour set, and the set's colours and fonts. */
  function lookBranding(id: LookId) {
    const tokens = SITE_LOOK_PRESETS[id];
    return {
      layoutId: id,
      themePresetSlug: id,
      primaryColor: tokens.primaryColor,
      secondaryColor: tokens.secondaryColor,
      accentColor: tokens.accentColor,
      fontHeading: tokens.headingFont,
      fontBody: tokens.bodyFont,
    };
  }

  async function createCommunity(label: string, communityType: CommunityType): Promise<number> {
    const [row] = await state.db
      .insert(state.dbModule.communities)
      .values({
        name: `Look switch ${label} ${state.runSuffix}`,
        slug: `look-switch-${label}-${state.runSuffix}`,
        communityType,
        timezone: 'America/New_York',
      })
      .returning({ id: state.dbModule.communities.id });
    if (!row) throw new Error(`Failed to create community "${label}"`);
    trackCommunityForCleanup(state, row.id);
    return row.id;
  }

  /** The home page a visitor sees: published sections in slot order. */
  async function liveSections(communityId: number): Promise<Section[]> {
    const { siteBlocks } = state.dbModule;
    const rows = await state.db
      .select({ blockType: siteBlocks.blockType, content: siteBlocks.content })
      .from(siteBlocks)
      .where(
        and(
          eq(siteBlocks.communityId, communityId),
          eq(siteBlocks.isDraft, false),
          isNull(siteBlocks.deletedAt),
        ),
      )
      .orderBy(asc(siteBlocks.blockOrder));
    return rows;
  }

  async function liveSlotOf(communityId: number, blockType: string): Promise<number> {
    const { siteBlocks } = state.dbModule;
    const [row] = await state.db
      .select({ blockOrder: siteBlocks.blockOrder })
      .from(siteBlocks)
      .where(
        and(
          eq(siteBlocks.communityId, communityId),
          eq(siteBlocks.blockType, blockType),
          eq(siteBlocks.isDraft, false),
          isNull(siteBlocks.deletedAt),
        ),
      );
    if (!row) throw new Error(`No live ${blockType} section`);
    return row.blockOrder;
  }

  /** The home page's live draft rows, ids included, in slot order. */
  async function draftRows(communityId: number) {
    const { siteBlocks } = state.dbModule;
    return state.db
      .select({
        id: siteBlocks.id,
        blockOrder: siteBlocks.blockOrder,
        blockType: siteBlocks.blockType,
        content: siteBlocks.content,
      })
      .from(siteBlocks)
      .where(
        and(
          eq(siteBlocks.communityId, communityId),
          eq(siteBlocks.isDraft, true),
          isNull(siteBlocks.deletedAt),
        ),
      )
      .orderBy(asc(siteBlocks.blockOrder));
  }

  async function auditRowCount(communityId: number): Promise<number> {
    const rows = await state.sqlClient.unsafe<Array<{ count: string }>>(
      `SELECT count(*) AS count FROM compliance_audit_log WHERE community_id = ${communityId}`,
    );
    return Number(rows[0]?.count ?? 0);
  }

  async function draftRowCount(communityId: number): Promise<number> {
    const { siteBlocks } = state.dbModule;
    const rows = await state.db
      .select({ id: siteBlocks.id })
      .from(siteBlocks)
      .where(
        and(
          eq(siteBlocks.communityId, communityId),
          eq(siteBlocks.isDraft, true),
          isNull(siteBlocks.deletedAt),
        ),
      );
    return rows.length;
  }

  async function readCommunity(communityId: number) {
    const { communities } = state.dbModule;
    const [row] = await state.db
      .select({ branding: communities.branding, sitePublishedAt: communities.sitePublishedAt })
      .from(communities)
      .where(eq(communities.id, communityId));
    if (!row) throw new Error('Community not found');
    return { branding: (row.branding ?? {}) as Record<string, unknown>, sitePublishedAt: row.sitePublishedAt };
  }

  async function publish(communityId: number): Promise<void> {
    const result = await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null });
    expect(result.published).toBe(true);
  }

  beforeAll(async () => {
    state = await initTestKit();
    actorUserId = randomUUID();
    await state.db.insert(state.dbModule.users).values({
      id: actorUserId,
      email: `look-switch-${state.runSuffix}@example.com`,
      fullName: `Look switch actor ${state.runSuffix}`,
      phone: null,
    });
    trackUserForCleanup(state, actorUserId);
    // `site_publish_snapshots.actor_user_id` references `auth.users`, which the
    // kit does not seed (the same mirror site-design-draft's test makes).
    await state.sqlClient.unsafe(
      `INSERT INTO auth.users (id, email) VALUES ('${actorUserId}'::uuid, 'look-switch-${state.runSuffix}@example.com') ON CONFLICT (id) DO NOTHING`,
    );
  });

  afterAll(async () => {
    if (!state) return;
    await state.sqlClient.unsafe(`DELETE FROM auth.users WHERE id = '${actorUserId}'::uuid`);
    await teardownTestKit(state);
  });

  it("switching twice and publishing leaves exactly the target look's sections plus the edited ones", async () => {
    // A site as community creation left it before the looks: the condo starter
    // pack on the type's default (legacy) layout. Its colour set is a look's
    // (migration 0097's sets could be picked before the looks shipped), which
    // still leaves it on a legacy look: the starter pack is what it received.
    const communityId = await createCommunity('legacy', 'condo_718');
    expect((await applyStarterPackToCommunity(communityId, 'condo_718')).applied).toBe(true);
    await updateBrandingForCommunity(communityId, { layoutId: 'tidewater', themePresetSlug: 'heritage' });

    // The manager has since published two edits: their own welcome text, and
    // Announcements hidden.
    await upsertPublishedBlock({
      communityId,
      actorUserId,
      blockType: 'hero',
      blockOrder: await liveSlotOf(communityId, 'hero'),
      content: EDITED_HERO,
    });
    const hiddenAnnouncements = { limit: 5, timeWindowDays: 30, hidden: true };
    await upsertPublishedBlock({
      communityId,
      actorUserId,
      blockType: 'announcements',
      blockOrder: await liveSlotOf(communityId, 'announcements'),
      content: hiddenAnnouncements,
    });
    const liveBefore = await liveSections(communityId);
    const brandingBefore = (await readCommunity(communityId)).branding;

    await draftLookSwitch(communityId, 'heritage', { actorUserId });

    // A draft: the live site and its look are untouched.
    expect(await liveSections(communityId)).toEqual(liveBefore);
    const drafted = (await readCommunity(communityId)).branding;
    expect(drafted.layoutId).toBe(brandingBefore.layoutId);
    expect(drafted.draftLook).toMatchObject(lookBranding('heritage'));

    // Changing their mind: Bayfront, planned from the drafted Heritage.
    await draftLookSwitch(communityId, 'bayfront', { actorUserId });
    await publish(communityId);

    // Bayfront's sections in Bayfront's order, with the manager's welcome text
    // and hidden Announcements in place of Bayfront's own.
    const bayfront = lookSections('bayfront');
    expect(await liveSections(communityId)).toEqual(
      bayfront.map((section) =>
        section.blockType === 'hero'
          ? { blockType: 'hero', content: EDITED_HERO }
          : section.blockType === 'announcements'
            ? { blockType: 'announcements', content: hiddenAnnouncements }
            : section,
      ),
    );
    expect(await draftRowCount(communityId)).toBe(0);

    // The look's layout, colour set, colours and fonts are live; the draft is gone.
    const { branding } = await readCommunity(communityId);
    expect(branding).toMatchObject(lookBranding('bayfront'));
    expect(branding).not.toHaveProperty('draftLook');
  });

  it('a new community goes live with its suggested look, and a switch publishes as exactly the new look', async () => {
    const communityId = await createCommunity('new', 'hoa_720');

    expect(await applyLookAtCreation(communityId, 'hoa_720')).toEqual({ applied: true, lookId: 'palm-grove' });

    expect(await liveSections(communityId)).toEqual(lookSections('palm-grove'));
    const created = await readCommunity(communityId);
    expect(created.branding).toMatchObject(lookBranding('palm-grove'));
    // Live from creation: a published home page, and the community reads as
    // published, stamped with the sections' own moment.
    const { siteBlocks, sitePages } = state.dbModule;
    const pages = await state.db
      .select({ isHome: sitePages.isHome, isDraft: sitePages.isDraft })
      .from(sitePages)
      .where(and(eq(sitePages.communityId, communityId), isNull(sitePages.deletedAt)));
    expect(pages).toEqual([{ isHome: true, isDraft: false }]);
    const [block] = await state.db
      .select({ publishedAt: siteBlocks.publishedAt })
      .from(siteBlocks)
      .where(and(eq(siteBlocks.communityId, communityId), isNull(siteBlocks.deletedAt)))
      .limit(1);
    expect(created.sitePublishedAt?.getTime()).toBe(block?.publishedAt?.getTime());

    // A second call (a provisioning retry) changes nothing.
    expect(await applyLookAtCreation(communityId, 'hoa_720')).toEqual({ applied: false, lookId: 'palm-grove' });
    expect(await liveSections(communityId)).toEqual(lookSections('palm-grove'));

    // Untouched, so the switch is exactly Heritage. The manager then changes
    // the drafted primary colour. Running the switch again (Publish this look
    // repeats the card's draft) writes nothing at all: the same draft rows, the
    // changed colour, and no audit row.
    const first = await draftLookSwitch(communityId, 'heritage', { actorUserId });
    await saveDraftDesign(communityId, { primaryColor: '#123456' }, { actorUserId });
    const drafts = await draftRows(communityId);
    const auditRowsBefore = await auditRowCount(communityId);
    const second = await draftLookSwitch(communityId, 'heritage', { actorUserId });
    expect(first.kept).toBe(0);
    expect(second).toEqual({ replaced: 0, kept: lookSections('heritage').length, added: 0, removed: 0 });
    expect(await draftRows(communityId)).toEqual(drafts);
    expect(await auditRowCount(communityId)).toBe(auditRowsBefore);
    expect((await readCommunity(communityId)).branding.draftLook).toMatchObject({ primaryColor: '#123456' });

    await publish(communityId);

    // Heritage is live, with the manager's colour.
    expect(await liveSections(communityId)).toEqual(lookSections('heritage'));
    expect((await readCommunity(communityId)).branding).toMatchObject({
      ...lookBranding('heritage'),
      primaryColor: '#123456',
    });
  });

  it('running a switch again for the drafted look moves nothing it kept', async () => {
    // A Heritage site whose only edit is Announcements 5 → 3, switched to Plain
    // & Simple. Its Announcements is kept in its slot, before Meetings. The
    // second run (Publish this look) must not move it after Meetings, although
    // { limit: 3 } is Plain & Simple's own default.
    const communityId = await createCommunity('again', 'condo_718');
    await applyLookAtCreation(communityId, 'condo_718');
    await draftLookSwitch(communityId, 'heritage', { actorUserId });
    await publish(communityId);
    await upsertPublishedBlock({
      communityId,
      actorUserId,
      blockType: 'announcements',
      blockOrder: await liveSlotOf(communityId, 'announcements'),
      content: { limit: 3 },
    });

    await draftLookSwitch(communityId, 'plain-simple', { actorUserId });
    const drafted = await draftRows(communityId);
    await draftLookSwitch(communityId, 'plain-simple', { actorUserId });
    expect(await draftRows(communityId)).toEqual(drafted);

    await publish(communityId);
    expect(await liveSections(communityId)).toEqual(
      lookSections('plain-simple')
        .filter((section) => section.blockType !== 'announcements')
        .flatMap((section) =>
          section.blockType === 'quicklinks'
            ? [section, { blockType: 'announcements', content: { limit: 3 } }]
            : [section],
        ),
    );
  });

  it('picking a card and then the live one again leaves nothing pending', async () => {
    // A live Bayfront site whose manager removed Quick links and published.
    const communityId = await createCommunity('round-trip', 'condo_718');
    await applyLookAtCreation(communityId, 'condo_718');
    await removeSiteBlock({ communityId, actorUserId, blockOrder: await liveSlotOf(communityId, 'quicklinks') });
    await publish(communityId);
    const live = await liveSections(communityId);
    expect(live.map((section) => section.blockType)).not.toContain('quicklinks');
    const pendingDesign = async () => pendingLook((await readCommunity(communityId)).branding as CommunityBranding);

    await draftLookSwitch(communityId, 'heritage', { actorUserId });
    expect(await draftRowCount(communityId)).toBeGreaterThan(0);
    expect(await pendingDesign()).toMatchObject({ layoutId: 'heritage' });

    // Back to the live card: no draft at all, no design change pending, and
    // Quick links does not come back.
    await draftLookSwitch(communityId, 'bayfront', { actorUserId });
    expect(await draftRowCount(communityId)).toBe(0);
    expect(await pendingDesign()).toEqual({});

    // Choosing it once more changes nothing either, and Publish has nothing to do.
    await draftLookSwitch(communityId, 'bayfront', { actorUserId });
    expect(await draftRowCount(communityId)).toBe(0);
    expect(await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null })).toEqual({
      published: false,
      reason: 'nothing-to-publish',
    });
    expect(await liveSections(communityId)).toEqual(live);
  });

  it("a card and back leaves nothing pending with a section type twice on the live page (the re-reviewer's cases A and C)", async () => {
    const bayfront = lookSections('bayfront');
    const of = (blockType: string) => bayfront.find((section) => section.blockType === blockType)!;
    const pages: Record<string, Section[]> = {
      // A: two text sections, Quick links after the first.
      'two-texts': [
        of('hero'),
        { blockType: 'text', content: { body: 'About us' } },
        of('quicklinks'),
        of('announcements'),
        of('meetings'),
        of('documents'),
        { blockType: 'text', content: { body: 'Pool hours' } },
        of('contact'),
      ],
      // C: an edited hero and two default Quick links.
      'two-quick-links': [
        { blockType: 'hero', content: EDITED_HERO },
        of('quicklinks'),
        of('quicklinks'),
        of('announcements'),
        of('meetings'),
        of('documents'),
        of('contact'),
      ],
    };

    for (const [label, page] of Object.entries(pages)) {
      // A live Bayfront site with that home page, in slots 1, 2, 3 …
      const communityId = await createCommunity(label, 'condo_718');
      await applyLookAtCreation(communityId, 'condo_718');
      for (const [i, section] of page.entries()) {
        await upsertPublishedBlock({ communityId, actorUserId, ...section, blockOrder: i + 1 });
      }
      const live = await liveSections(communityId);
      expect(live).toEqual(page);

      await draftLookSwitch(communityId, 'heritage', { actorUserId });
      expect(await draftRowCount(communityId)).toBeGreaterThan(0);
      await draftLookSwitch(communityId, 'bayfront', { actorUserId });

      // No draft at all, no design change pending, and Publish has nothing to do.
      expect({ label, drafts: await draftRows(communityId) }).toEqual({ label, drafts: [] });
      expect(pendingLook((await readCommunity(communityId)).branding as CommunityBranding)).toEqual({});
      expect(await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null })).toEqual({
        published: false,
        reason: 'nothing-to-publish',
      });
      expect(await liveSections(communityId)).toEqual(live);
    }
  });

  it('one edit between the clicks is the only change pending, in its place (Plain & Simple, Heritage, hero edited, back)', async () => {
    const communityId = await createCommunity('one-edit', 'apartment');
    await applyLookAtCreation(communityId, 'apartment');
    const live = await liveSections(communityId);
    expect(live).toEqual(lookSections('plain-simple'));

    await draftLookSwitch(communityId, 'heritage', { actorUserId });
    // The manager edits the drafted hero, the way the editor saves an edit: a
    // draft in its slot.
    const editedHero = { headline: 'Harbor Pointe' };
    await upsertPublishedBlock({ communityId, actorUserId, blockType: 'hero', blockOrder: 1, content: editedHero, isDraft: true });
    await draftLookSwitch(communityId, 'plain-simple', { actorUserId });

    // Exactly that edit, in slot 1: no reorder, no other draft, no design change.
    const drafts = await draftRows(communityId);
    expect(drafts.map(({ blockOrder, blockType, content }) => ({ blockOrder, blockType, content }))).toEqual([
      { blockOrder: 1, blockType: 'hero', content: editedHero },
    ]);
    expect(pendingLook((await readCommunity(communityId)).branding as CommunityBranding)).toEqual({});

    await publish(communityId);
    expect(await liveSections(communityId)).toEqual(
      live.map((section) => (section.blockType === 'hero' ? { blockType: 'hero', content: editedHero } : section)),
    );
  });

  it('an edited section returns to its live row (Bayfront, Heritage with Announcements edited 5 → 4, back)', async () => {
    const communityId = await createCommunity('edited-row', 'condo_718');
    await applyLookAtCreation(communityId, 'condo_718');
    const live = await liveSections(communityId);
    const liveSlot = await liveSlotOf(communityId, 'announcements');

    await draftLookSwitch(communityId, 'heritage', { actorUserId });
    // Heritage's Announcements, drafted in another slot (Heritage has no Quick
    // links, so it moved up one), edited to show four.
    const drafted = (await draftRows(communityId)).find((row) => row.blockType === 'announcements');
    expect(drafted).toMatchObject({ content: { limit: 5 } });
    expect(drafted?.blockOrder).not.toBe(liveSlot);
    await upsertPublishedBlock({
      communityId,
      actorUserId,
      blockType: 'announcements',
      blockOrder: drafted!.blockOrder,
      content: { limit: 4 },
      isDraft: true,
    });

    await draftLookSwitch(communityId, 'bayfront', { actorUserId });

    // The one pending draft is that edit, in the live Announcements' slot.
    const drafts = await draftRows(communityId);
    expect(drafts.map(({ blockOrder, blockType, content }) => ({ blockOrder, blockType, content }))).toEqual([
      { blockOrder: liveSlot, blockType: 'announcements', content: { limit: 4 } },
    ]);
    expect(pendingLook((await readCommunity(communityId)).branding as CommunityBranding)).toEqual({});

    // Published: Bayfront as it was, with one Announcements showing four.
    await publish(communityId);
    expect(await liveSections(communityId)).toEqual(
      live.map((section) =>
        section.blockType === 'announcements' ? { blockType: 'announcements', content: { limit: 4 } } : section,
      ),
    );
  });

  it("publishing after a card and back never drops a live section with a type twice on the page (the re-reviewer's routes A and B)", async () => {
    /** The live home page after Publish keeps every section it had, in order, plus the edit once. */
    const expectKeptWithTheEdit = (after: Section[], before: Section[], edit: Section) => {
      const isEdit = (section: Section) => JSON.stringify(section) === JSON.stringify(edit);
      expect(after.filter(isEdit)).toHaveLength(1);
      expect(after.filter((section) => !isEdit(section))).toEqual(before);
    };

    // A: live Bayfront with the manager's own Announcements (10, over a year)
    // after Bayfront's. The Heritage card stages it in the other one's slot,
    // where it is edited to 8; then the Bayfront card again, and Publish.
    const a = await createCommunity('route-a', 'condo_718');
    await applyLookAtCreation(a, 'condo_718');
    const annual: Section = { blockType: 'announcements', content: { limit: 10, timeWindowDays: 365 } };
    const pageA: Section[] = [...lookSections('bayfront')];
    pageA.splice(3, 0, annual);
    for (const [i, section] of pageA.entries()) {
      await upsertPublishedBlock({ communityId: a, actorUserId, ...section, blockOrder: i + 1 });
    }
    const liveA = await liveSections(a);
    expect(liveA).toEqual(pageA);
    await draftLookSwitch(a, 'heritage', { actorUserId });
    const copy = (await draftRows(a)).find((row) => JSON.stringify(row.content) === JSON.stringify(annual.content));
    expect(copy?.blockOrder).toBe(await liveSlotOf(a, 'quicklinks') + 1); // the Bayfront Announcements' slot
    const editA: Section = { blockType: 'announcements', content: { limit: 8, timeWindowDays: 365 } };
    await upsertPublishedBlock({ communityId: a, actorUserId, ...editA, blockOrder: copy!.blockOrder, isDraft: true });
    await draftLookSwitch(a, 'bayfront', { actorUserId });
    await publish(a);
    expectKeptWithTheEdit(await liveSections(a), liveA, editA);

    // B: live Heritage with the manager's Contact (board shown) in slot 6 and
    // Heritage's own in slot 7. The Bayfront card keeps the manager's in place,
    // where it is edited; then the Heritage card again, and Publish.
    const b = await createCommunity('route-b', 'condo_718');
    await applyLookAtCreation(b, 'condo_718');
    await draftLookSwitch(b, 'heritage', { actorUserId });
    await publish(b);
    const heritage = lookSections('heritage');
    const pageB: Section[] = [
      ...heritage.filter((section) => section.blockType !== 'contact'),
      { blockType: 'contact', content: { showBoard: true, showManagement: true } },
      heritage.find((section) => section.blockType === 'contact')!,
    ];
    for (const [i, section] of pageB.entries()) {
      await upsertPublishedBlock({ communityId: b, actorUserId, ...section, blockOrder: i + 1 });
    }
    const liveB = await liveSections(b);
    expect(liveB).toEqual(pageB);
    await draftLookSwitch(b, 'bayfront', { actorUserId });
    // The manager's Contact is still the published row in slot 6 (no draft over it).
    expect((await draftRows(b)).some((row) => row.blockOrder === 6)).toBe(false);
    const editB: Section = { blockType: 'contact', content: { showBoard: true, showManagement: false } };
    await upsertPublishedBlock({ communityId: b, actorUserId, ...editB, blockOrder: 6, isDraft: true });
    await draftLookSwitch(b, 'heritage', { actorUserId });
    await publish(b);
    expectKeptWithTheEdit(await liveSections(b), liveB, editB);
  });

  it('Keep this look over an older layout takes a drafted look back off, keeping an edit made since', async () => {
    // A site still on a legacy layout with its starter pack: no look card can
    // return to it, so the look picker's Keep this look withdraws by the live rows.
    const communityId = await createCommunity('legacy-keep', 'condo_718');
    expect((await applyStarterPackToCommunity(communityId, 'condo_718')).applied).toBe(true);
    await updateBrandingForCommunity(communityId, { layoutId: 'tidewater' });
    const live = await liveSections(communityId);
    const liveHeroSlot = await liveSlotOf(communityId, 'hero');

    await draftLookSwitch(communityId, 'heritage', { actorUserId });
    expect(pendingLook((await readCommunity(communityId)).branding as CommunityBranding)).toMatchObject({
      layoutId: 'heritage',
    });
    // The manager then edits the drafted hero, the way the editor saves an edit.
    const heroSlot = (await draftRows(communityId)).find((row) => row.blockType === 'hero')?.blockOrder ?? liveHeroSlot;
    await upsertPublishedBlock({ communityId, actorUserId, blockType: 'hero', blockOrder: heroSlot, content: EDITED_HERO, isDraft: true });

    expect(await withdrawDraftedLook(communityId, { actorUserId })).toEqual({ withdrawn: true });

    // Exactly that edit is left, over the live hero; no look is drafted any more.
    const drafts = await draftRows(communityId);
    expect(drafts.map(({ blockOrder, blockType, content }) => ({ blockOrder, blockType, content }))).toEqual([
      { blockOrder: liveHeroSlot, blockType: 'hero', content: EDITED_HERO },
    ]);
    const { branding } = await readCommunity(communityId);
    expect(pendingLook(branding as CommunityBranding)).toEqual({});
    expect(branding.layoutId).toBe('tidewater');
    // Nothing more to take back.
    expect(await withdrawDraftedLook(communityId, { actorUserId })).toEqual({ withdrawn: false });

    // A later Publish puts live the edit and nothing of the look.
    await publish(communityId);
    expect(await liveSections(communityId)).toEqual(
      live.map((section) => (section.blockType === 'hero' ? { blockType: 'hero', content: EDITED_HERO } : section)),
    );
    expect((await readCommunity(communityId)).branding.layoutId).toBe('tidewater');
  });

  it('Keep this look with nothing drafted writes nothing', async () => {
    const communityId = await createCommunity('keep-nothing', 'condo_718');
    await applyLookAtCreation(communityId, 'condo_718');
    const audits = await auditRowCount(communityId);

    expect(await withdrawDraftedLook(communityId, { actorUserId })).toEqual({ withdrawn: false });

    expect(await draftRowCount(communityId)).toBe(0);
    expect(await auditRowCount(communityId)).toBe(audits);
  });

  it('publishing a switch to a look with fewer sections leaves none behind', async () => {
    // Bayfront has six sections and Palm Grove five: the sixth slot is staged
    // for removal (a tombstone), which the editor's Publish applies.
    const communityId = await createCommunity('fewer', 'condo_718');
    await applyLookAtCreation(communityId, 'condo_718');

    await draftLookSwitch(communityId, 'palm-grove', { actorUserId });
    await publish(communityId);

    expect(await liveSections(communityId)).toEqual(lookSections('palm-grove'));
    expect(await draftRowCount(communityId)).toBe(0);
  });

  it('discarding a switch puts back the live site and its look', async () => {
    const communityId = await createCommunity('discard', 'condo_718');
    await applyLookAtCreation(communityId, 'condo_718');
    await draftLookSwitch(communityId, 'plain-simple', { actorUserId });
    expect(await draftRowCount(communityId)).toBeGreaterThan(0);

    await discardSiteDrafts({ communityId, actorUserId });

    expect(await draftRowCount(communityId)).toBe(0);
    expect(await liveSections(communityId)).toEqual(lookSections('bayfront'));
    const { branding } = await readCommunity(communityId);
    expect(branding).toMatchObject(lookBranding('bayfront'));
    expect(branding).not.toHaveProperty('draftLook');
  });

  it("a look preview's plan, read the way the preview reads it, is the home page the draft then leaves", async () => {
    // The look previews (`/pm/site-preview?look=`) plan from `loadLookSwitchInput`
    // read WITHOUT a transaction; the draft plans from the same read inside one.
    // A Bayfront site whose welcome text the manager has edited and published:
    // Heritage keeps the edit, drops Quick links and adds Board members.
    const communityId = await createCommunity('preview', 'condo_718');
    await applyLookAtCreation(communityId, 'condo_718');
    await upsertPublishedBlock({
      communityId,
      actorUserId,
      blockType: 'hero',
      blockOrder: await liveSlotOf(communityId, 'hero'),
      content: EDITED_HERO,
    });
    const asRendered = (sections: ReadonlyArray<{ blockType: string; content: unknown }>): Section[] =>
      sections.map(({ blockType, content }) => ({ blockType, content }));
    const previewOf = async (lookId: LookId) =>
      planLookSwitch({ ...(await loadLookSwitchInput(communityId)), incoming: getLook(lookId)! });
    const auditRowsBefore = await auditRowCount(communityId);

    // The live look's card shows the page as it is: nothing is being switched.
    const pageNow = asRendered((await loadLookSwitchInput(communityId)).current);
    expect(asRendered(await previewOf('bayfront'))).toEqual(pageNow);

    const previewed = await previewOf('heritage');

    // Previewing writes nothing: no draft row, no audit row, no draft look.
    expect(await draftRowCount(communityId)).toBe(0);
    expect(await auditRowCount(communityId)).toBe(auditRowsBefore);
    expect((await readCommunity(communityId)).branding).not.toHaveProperty('draftLook');
    // The edit is in the preview, and so is what Heritage adds.
    expect(asRendered(previewed)[0]).toEqual({ blockType: 'hero', content: EDITED_HERO });
    expect(previewed.map((section) => section.blockType)).toContain('board');
    expect(previewed.map((section) => section.blockType)).not.toContain('quicklinks');

    await draftLookSwitch(communityId, 'heritage', { actorUserId });

    // What the manager then sees in the editor is what the card showed them.
    expect(asRendered((await loadLookSwitchInput(communityId)).current)).toEqual(asRendered(previewed));

    // And the live look's card now shows the way back, which the draft restores:
    // the live page, keeping the edit.
    const wayBack = await previewOf('bayfront');
    expect(asRendered(wayBack)[0]).toEqual({ blockType: 'hero', content: EDITED_HERO });
    expect(wayBack.map((section) => section.blockType)).toEqual(lookSections('bayfront').map((section) => section.blockType));
    await draftLookSwitch(communityId, 'bayfront', { actorUserId });
    expect(asRendered((await loadLookSwitchInput(communityId)).current)).toEqual(asRendered(wayBack));
    expect(await draftRowCount(communityId)).toBe(0);
  });

  it('a look preview paints the colours and fonts the draft leaves, whichever kind of switch the card is', async () => {
    // Each card is previewed, then chosen, and the branding a renderer would read
    // after the choice (the draft over the live look) must be what the preview
    // painted. The live card is the one that could lie: it must paint the LIVE
    // colours, which are not the look's stock ones once a manager has published
    // their own.
    const communityId = await createCommunity('preview-colours', 'condo_718');
    await applyLookAtCreation(communityId, 'condo_718');
    await updateBrandingForCommunity(communityId, {
      primaryColor: '#AA0000',
      customCssOverrides: { secondaryColor: '#334455' },
    });

    /** The look fields of a branding as a renderer reads it. */
    const lookFields = (branding: Record<string, unknown>, includeDraft: boolean) =>
      liveLook(effectiveLook(branding as CommunityBranding, { includeDraft }));
    const preview = async (lookId: LookId) => {
      const look = getLook(lookId)!;
      const plan = planLookSwitchWithCounts({ ...(await loadLookSwitchInput(communityId)), incoming: look });
      const { branding } = await readCommunity(communityId);
      return {
        kind: plan.kind,
        painted: liveLook(
          resolveLookPreviewBranding(plan.kind, branding as CommunityBranding, look, SITE_LOOK_PRESETS[lookId]),
        ),
      };
    };
    const afterChoosing = async () => lookFields((await readCommunity(communityId)).branding, true);

    // 1. The live card (Bayfront, nothing drafted): the live site's colours. Choosing it writes nothing.
    const liveCard = await preview('bayfront');
    expect(liveCard.kind).toBe('live-look');
    expect(liveCard.painted).toEqual(lookFields((await readCommunity(communityId)).branding, false));
    expect(liveCard.painted).toMatchObject({
      layoutId: 'bayfront',
      primaryColor: '#AA0000',
      customCssOverrides: { secondaryColor: '#334455' },
    });
    expect(liveCard.painted.primaryColor).not.toBe(SITE_LOOK_PRESETS.bayfront.primaryColor);
    await draftLookSwitch(communityId, 'bayfront', { actorUserId });
    expect(await draftRowCount(communityId)).toBe(0);
    expect((await readCommunity(communityId)).branding).not.toHaveProperty('draftLook');
    expect(await afterChoosing()).toEqual(liveCard.painted);

    // 2. Another look: its colour set, layout and fonts, with the custom colours kept.
    const heritageCard = await preview('heritage');
    expect(heritageCard.kind).toBe('switch');
    await draftLookSwitch(communityId, 'heritage', { actorUserId });
    expect(await afterChoosing()).toEqual(heritageCard.painted);
    expect(heritageCard.painted).toMatchObject({
      ...lookBranding('heritage'),
      customCssOverrides: { secondaryColor: '#334455' },
    });

    // 3. The look already drafted, after the manager changed a drafted colour:
    // choosing it again writes nothing, so the card paints the drafted colours as they are.
    await saveDraftDesign(communityId, { primaryColor: '#0000FF' }, { actorUserId });
    const againCard = await preview('heritage');
    expect(againCard.kind).toBe('already-drafted');
    expect(againCard.painted.primaryColor).toBe('#0000FF');
    await draftLookSwitch(communityId, 'heritage', { actorUserId });
    expect(await afterChoosing()).toEqual(againCard.painted);

    // 4. Back to the live look, after the manager also drafted custom colours: the drafted
    // layout, colour set and colours are withdrawn; the custom colours are theirs and stay.
    await saveDraftDesign(communityId, { customCssOverrides: { primaryColor: '#654321' } }, { actorUserId });
    const backCard = await preview('bayfront');
    expect(backCard.kind).toBe('back-to-live');
    await draftLookSwitch(communityId, 'bayfront', { actorUserId });
    expect(await afterChoosing()).toEqual(backCard.painted);
    expect(backCard.painted).toMatchObject({
      layoutId: 'bayfront',
      themePresetSlug: 'bayfront',
      primaryColor: '#AA0000',
      customCssOverrides: { primaryColor: '#654321' },
    });
  });
});
