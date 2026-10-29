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
import type { CommunityType } from '@propertypro/shared';
import { updateBrandingForCommunity } from '@/lib/api/branding';
import {
  discardSiteDrafts,
  publishCommunitySite,
  upsertPublishedBlock,
} from '@/lib/services/site-blocks-service';
import { applyLookAtCreation, draftLookSwitch } from '@/lib/services/site-look-service';
import { applyStarterPackToCommunity } from '@/lib/services/starter-pack-service';
import { getLook, type LookId } from '@/lib/site-looks/looks';
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

    // Untouched, so the switch is exactly Heritage. Saving it again (Publish
    // this look repeats the card's draft) leaves those drafts exactly as they
    // are: the same rows, not new copies.
    const first = await draftLookSwitch(communityId, 'heritage', { actorUserId });
    const drafts = await draftRows(communityId);
    const second = await draftLookSwitch(communityId, 'heritage', { actorUserId });
    expect(first.kept).toBe(0);
    expect(second).toEqual({ replaced: 0, kept: lookSections('heritage').length, added: 0, removed: 0 });
    expect(await draftRows(communityId)).toEqual(drafts);

    await publish(communityId);

    expect(await liveSections(communityId)).toEqual(lookSections('heritage'));
    expect((await readCommunity(communityId)).branding).toMatchObject(lookBranding('heritage'));
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
});
