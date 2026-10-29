/**
 * The look service: a new community's suggested look, published at creation;
 * a look switch saved as a draft; and the loader both the switch and the look
 * previews plan from.
 *
 * The statements are mocked here, but the design save is real
 * (`resolveDesign` / `writeDraftDesign`, down to `mergeBranding`), so these
 * tests see the draft look the switch writes and which transaction it is
 * written in. What the statements do against Postgres (a switch planned from
 * the draft look, then published by the editor's own Publish) is
 * site-look-switch.integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createScopedClient: vi.fn(),
  createUnscopedClient: vi.fn(),
  logAuditEvent: vi.fn(),
  ensureHomePage: vi.fn(),
  updateBrandingForCommunity: vi.fn(),
  getBrandingForCommunity: vi.fn(),
  listThemePresetsForWizard: vi.fn(),
  mergeBranding: vi.fn(),
}));

// vi.importActual cannot be used: the real @propertypro/db needs DATABASE_URL at
// load. Every export the services read is stubbed.
vi.mock('@propertypro/db', () => ({
  createScopedClient: mocks.createScopedClient,
  logAuditEvent: mocks.logAuditEvent,
  communities: {
    id: 'communities.id',
    communityType: 'communities.community_type',
    branding: 'communities.branding',
    sitePublishedAt: 'communities.site_published_at',
  },
  siteBlocks: {
    pageId: 'site_blocks.page_id',
    isDraft: 'site_blocks.is_draft',
    deletedAt: 'site_blocks.deleted_at',
  },
  sitePages: { id: 'site_pages.id', isDraft: 'site_pages.is_draft', isHome: 'site_pages.is_home' },
  siteStarterPacks: { blocks: 'site_starter_packs.blocks', communityType: 'site_starter_packs.community_type' },
}));

vi.mock('@propertypro/db/unsafe', () => ({ createUnscopedClient: mocks.createUnscopedClient }));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: [col, val] }),
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  isNull: (col: unknown) => ({ __isNull: col }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: [...strings], values }),
}));

// site-pages-service reads its tables at module load, so it is replaced whole.
vi.mock('@/lib/services/site-pages-service', () => ({ ensureHomePage: mocks.ensureHomePage }));
vi.mock('@/lib/api/branding', () => ({
  updateBrandingForCommunity: mocks.updateBrandingForCommunity,
  getBrandingForCommunity: mocks.getBrandingForCommunity,
}));
vi.mock('@/lib/db/theme-preset-catalog', () => ({
  listThemePresetsForWizard: mocks.listThemePresetsForWizard,
}));
vi.mock('@/lib/services/site-settings-service', () => ({ mergeBranding: mocks.mergeBranding }));

import { TOMBSTONE_BLOCK_TYPE } from '@propertypro/shared';
import {
  communities as communitiesTable,
  sitePages as sitePagesTable,
  siteStarterPacks as siteStarterPacksTable,
} from '@propertypro/db';
import { applyLookAtCreation, draftLookSwitch, loadLookSwitchInput } from '@/lib/services/site-look-service';
import { LOOK_IDS, getLook, type LookId, type LookSection } from '@/lib/site-looks/looks';
import { SITE_LOOK_PRESETS } from '../../fixtures/site-look-presets';

const COMMUNITY_ID = 10;
const HOME_PAGE_ID = 77;
const ACTOR = 'actor-user-id';

interface BlockRow {
  id: number;
  pageId: number;
  blockType: string;
  blockOrder: number;
  content: unknown;
  isDraft: boolean;
}

interface InsertedBlock {
  communityId: number;
  pageId: number;
  blockType: string;
  blockOrder: number;
  isDraft: boolean;
  publishedAt: Date | null;
  content: unknown;
}

function look(id: string) {
  const found = getLook(id);
  if (!found) throw new Error(`No look "${id}"`);
  return found;
}

/** A look's sections as published rows at slots 1, 2, 3 … (or the slots given). */
function publishedRows(sections: readonly LookSection[], firstId = 500, slots?: readonly number[]): BlockRow[] {
  return sections.map((section, i) => ({
    id: firstId + i,
    pageId: HOME_PAGE_ID,
    blockType: section.blockType,
    blockOrder: slots?.[i] ?? i + 1,
    content: structuredClone(section.content),
    isDraft: false,
  }));
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

/** The four look presets, as the catalog reader returns them. */
const ALL_PRESETS = (Object.keys(SITE_LOOK_PRESETS) as LookId[]).map((slug) => ({
  id: 1,
  slug,
  displayName: slug,
  description: null,
  tokens: SITE_LOOK_PRESETS[slug],
  tier: 'essentials' as const,
  isFeatured: true,
}));

interface World {
  community?: { communityType: string; branding: Record<string, unknown> };
  /** Defaults to HOME_PAGE_ID; null for a community with no home page yet. */
  homePageId?: number | null;
  homeRows?: BlockRow[];
  /** The answers to "has this community any published section?", in order. */
  publishedChecks?: unknown[][];
}

/** One scoped client for every scope: it answers each read by table (and, for site_blocks, by predicate). */
function buildScoped(world: World = {}) {
  const publishedChecks = [...(world.publishedChecks ?? [])];
  const homePageId = world.homePageId === undefined ? HOME_PAGE_ID : world.homePageId;
  return {
    query: vi.fn(async (table: unknown) => (table === communitiesTable && world.community ? [world.community] : [])),
    queryWhere: vi.fn(async (table: unknown, where: unknown) => {
      if (table === sitePagesTable) return homePageId === null ? [] : [{ id: homePageId }];
      const predicate = JSON.stringify(where);
      if (predicate.includes('site_blocks.is_draft')) return publishedChecks.shift() ?? [];
      if (predicate.includes('site_blocks.page_id')) return world.homeRows ?? [];
      return [];
    }),
    insert: vi.fn(async (_table: unknown, _values: InsertedBlock) => [{ id: 1 }]),
    update: vi.fn(async (_table: unknown, _values: unknown, _where: unknown) => []),
    softDelete: vi.fn(async (_table: unknown, _where: unknown) => []),
  };
}

/**
 * A transaction double. `select().from(table).where()` answers the starter-pack
 * read, and every `update` is recorded. The client opens it, and also answers a
 * starter-pack read made with no transaction open.
 */
function buildTx(opts: { packs?: unknown[] } = {}) {
  const updates: Array<{ table: unknown; values: Record<string, unknown>; where: unknown }> = [];
  const selectedTables: unknown[] = [];
  const whereFor = new Map<unknown, unknown>();
  const select = vi.fn((_fields: unknown) => ({
    from: vi.fn((table: unknown) => {
      selectedTables.push(table);
      return {
        where: vi.fn(async (predicate: unknown) => {
          whereFor.set(table, predicate);
          return table === siteStarterPacksTable ? (opts.packs ?? []) : [];
        }),
      };
    }),
  }));
  const tx = {
    execute: vi.fn(async (_query: unknown) => []),
    select,
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async (where: unknown) => {
          updates.push({ table, values, where });
          return [];
        }),
      })),
    })),
  };
  const client = { transaction: vi.fn(async (run: (t: typeof tx) => unknown) => run(tx)), select };
  return { tx, client, updates, selectedTables, whereFor };
}

/** Wires a world and a transaction into the mocks. */
function setUp(world: World = {}, opts: { packs?: unknown[] } = {}) {
  const scoped = buildScoped(world);
  mocks.createScopedClient.mockReturnValue(scoped);
  const db = buildTx(opts);
  mocks.createUnscopedClient.mockReturnValue(db.client);
  return { scoped, ...db };
}

/**
 * The home page after the next publish: each slot's draft if it has one, else
 * its published row, with tombstoned slots gone. The rule `publishCommunitySite`
 * applies, so a test can state what a draft would publish.
 */
function afterPublish(published: BlockRow[], drafts: InsertedBlock[]) {
  const bySlot = new Map<number, { blockType: string; content: unknown }>();
  for (const row of published) bySlot.set(row.blockOrder, row);
  for (const draft of drafts) bySlot.set(draft.blockOrder, draft);
  return [...bySlot.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, s]) => s.blockType !== TOMBSTONE_BLOCK_TYPE)
    .map(([, s]) => ({ blockType: s.blockType, content: s.content }));
}

function insertedBlocks(scoped: ReturnType<typeof buildScoped>): InsertedBlock[] {
  return scoped.insert.mock.calls.map(([, values]) => values);
}

function auditActions(): unknown[] {
  return mocks.logAuditEvent.mock.calls.map(([entry]) => (entry as { action: string; resourceType: string }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureHomePage.mockResolvedValue(HOME_PAGE_ID);
  mocks.listThemePresetsForWizard.mockResolvedValue(ALL_PRESETS);
  mocks.mergeBranding.mockResolvedValue(undefined);
  mocks.updateBrandingForCommunity.mockResolvedValue({});
  mocks.logAuditEvent.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// applyLookAtCreation
// ---------------------------------------------------------------------------

describe('applyLookAtCreation', () => {
  it('applyLookAtCreation skips a community that already has published blocks', async () => {
    const { scoped, client } = setUp({ publishedChecks: [[{ id: 1, isDraft: false }]] });

    const result = await applyLookAtCreation(COMMUNITY_ID, 'condo_718');

    expect(result).toEqual({ applied: false, lookId: 'bayfront' });
    expect(client.transaction).not.toHaveBeenCalled();
    expect(scoped.insert).not.toHaveBeenCalled();
    expect(mocks.updateBrandingForCommunity).not.toHaveBeenCalled();
  });

  it('applyLookAtCreation writes layout, preset, colours and fonts, publishes the sections, and stamps site_published_at only when null', async () => {
    const { scoped, tx, updates } = setUp({ publishedChecks: [[], []] });

    const result = await applyLookAtCreation(COMMUNITY_ID, 'hoa_720');

    expect(result).toEqual({ applied: true, lookId: 'palm-grove' });

    // Branding: the look's layout and colour set, and the set's colours and
    // fonts under the names the renderer reads.
    expect(mocks.updateBrandingForCommunity).toHaveBeenCalledWith(COMMUNITY_ID, lookBranding('palm-grove'));

    // Under the community row lock, on a published home page, through the
    // scoped client.
    expect(JSON.stringify(tx.execute.mock.calls[0]?.[0])).toContain('FOR UPDATE');
    expect(mocks.ensureHomePage).toHaveBeenCalledWith(COMMUNITY_ID, tx, { publishedAt: expect.any(Date) });
    const now = (mocks.ensureHomePage.mock.calls[0]?.[2] as { publishedAt: Date }).publishedAt;
    expect(scoped.update).toHaveBeenCalledWith(
      sitePagesTable,
      { isDraft: false, publishedAt: now },
      { __and: [{ __eq: ['site_pages.id', HOME_PAGE_ID] }, { __eq: ['site_pages.is_draft', true] }] },
    );

    // Every section of the look, published, in order: the hero in slot 1.
    const sections = look('palm-grove').sections;
    expect(insertedBlocks(scoped)).toEqual(
      sections.map((section, i) => ({
        communityId: COMMUNITY_ID,
        pageId: HOME_PAGE_ID,
        blockType: section.blockType,
        blockOrder: i + 1,
        isDraft: false,
        publishedAt: now,
        content: section.content,
      })),
    );

    // site_published_at is stamped with the same moment, and only where unset.
    const stamp = updates.find((u) => u.table === communitiesTable);
    expect(stamp?.values).toEqual({ sitePublishedAt: now });
    expect(JSON.stringify(stamp?.where)).toContain('{"__isNull":"communities.site_published_at"}');
  });

  it('checks again under the community lock, so racing calls publish the look once', async () => {
    // Nothing published at the first look; a racing call has published by the
    // time the lock is held.
    const { scoped, updates } = setUp({ publishedChecks: [[], [{ id: 1, isDraft: false }]] });

    const result = await applyLookAtCreation(COMMUNITY_ID, 'apartment');

    expect(result).toEqual({ applied: false, lookId: 'plain-simple' });
    expect(scoped.insert).not.toHaveBeenCalled();
    expect(scoped.update).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('writes the branding first, so a retry can finish a site whose sections failed to publish', async () => {
    const { scoped, client } = setUp({ publishedChecks: [[], [], []] });
    const failing = { transaction: vi.fn(async () => Promise.reject(new Error('connection reset'))) };
    mocks.createUnscopedClient.mockReturnValueOnce(failing);

    await expect(applyLookAtCreation(COMMUNITY_ID, 'condo_718')).rejects.toThrow('connection reset');
    // The look's branding is already there, so the site is not left on the
    // type's legacy layout behind sections a retry would skip.
    expect(mocks.updateBrandingForCommunity).toHaveBeenCalledTimes(1);

    mocks.createUnscopedClient.mockReturnValue(client);
    expect(await applyLookAtCreation(COMMUNITY_ID, 'condo_718')).toEqual({ applied: true, lookId: 'bayfront' });
    expect(scoped.insert).toHaveBeenCalledTimes(look('bayfront').sections.length);
  });

  it("refuses before writing anything when the look's colour set is missing", async () => {
    mocks.listThemePresetsForWizard.mockResolvedValue([]);
    const { client } = setUp({ publishedChecks: [[]] });

    await expect(applyLookAtCreation(COMMUNITY_ID, 'condo_718')).rejects.toThrow('That colour set does not exist');

    expect(mocks.updateBrandingForCommunity).not.toHaveBeenCalled();
    expect(client.transaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// draftLookSwitch
// ---------------------------------------------------------------------------

describe('draftLookSwitch', () => {
  it('draftLookSwitch writes draftLook and draft sections, never the live site', async () => {
    const published = publishedRows(look('bayfront').sections);
    // A pending edit the manager made to Meetings (slot 4): theirs, so it stays.
    const editedMeetings: BlockRow = {
      id: 900,
      pageId: HOME_PAGE_ID,
      blockType: 'meetings',
      blockOrder: 4,
      content: { limit: 9 },
      isDraft: true,
    };
    const { scoped, tx, updates, selectedTables } = setUp({
      community: { communityType: 'condo_718', branding: { layoutId: 'bayfront', themePresetSlug: 'bayfront' } },
      homeRows: [...published, editedMeetings],
    });

    const counts = await draftLookSwitch(COMMUNITY_ID, 'heritage', { actorUserId: ACTOR });

    // The look goes into the draft look, in the same transaction as the
    // sections, through the design save (and its audit row).
    expect(mocks.mergeBranding).toHaveBeenCalledTimes(1);
    expect(mocks.mergeBranding).toHaveBeenCalledWith(COMMUNITY_ID, { draftLook: lookBranding('heritage') }, tx);
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'site_design_draft_saved', communityId: COMMUNITY_ID, userId: ACTOR }),
      tx,
    );

    // Nothing live: no live branding write, no UPDATE of any row (publishing is
    // an UPDATE), and every row written is a draft.
    expect(mocks.updateBrandingForCommunity).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
    expect(scoped.update).not.toHaveBeenCalled();
    const drafts = insertedBlocks(scoped);
    expect(drafts.length).toBeGreaterThan(0);
    for (const draft of drafts) {
      expect(draft).toMatchObject({ communityId: COMMUNITY_ID, pageId: HOME_PAGE_ID, isDraft: true, publishedAt: null });
    }
    // The home page's old drafts are cleared first (only drafts, only that page).
    expect(scoped.softDelete).toHaveBeenCalledTimes(1);
    const cleared = JSON.stringify(scoped.softDelete.mock.calls[0]?.[1]);
    expect(cleared).toContain('{"__eq":["site_blocks.page_id",77]}');
    expect(cleared).toContain('{"__eq":["site_blocks.is_draft",true]}');

    // What the editor's Publish would then make live: Heritage, with the
    // manager's Meetings in place of Heritage's.
    const [hero, announcements, , documents, board, contact] = look('heritage').sections.map(
      ({ blockType, content }) => ({ blockType, content }),
    );
    expect(afterPublish(published, drafts)).toEqual([
      hero,
      announcements,
      { blockType: 'meetings', content: { limit: 9 } },
      documents,
      board,
      contact,
    ]);
    expect(counts).toEqual({ replaced: 4, kept: 1, added: 1, removed: 1 });

    // A look layout: the outgoing defaults are that look's, not the starter packs.
    expect(selectedTables).not.toContain(siteStarterPacksTable);

    // The sections are audited in the same transaction as the drafts.
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ACTOR,
        communityId: COMMUNITY_ID,
        action: 'update',
        resourceType: 'community_site',
        metadata: expect.objectContaining({ lookId: 'heritage', replaced: 4, kept: 1, added: 1, removed: 1 }),
      }),
      tx,
    );
  });

  it('plans from the drafted look when there is one', async () => {
    // Bayfront is live and Heritage was drafted over it. Switching on to Palm
    // Grove treats Heritage's sections as untouched (not Bayfront's), so the
    // page becomes Palm Grove exactly.
    const published = publishedRows(look('bayfront').sections);
    const heritageDrafts = look('heritage').sections.map((section, i) => ({
      id: 700 + i,
      pageId: HOME_PAGE_ID,
      blockType: section.blockType,
      blockOrder: i + 1,
      content: structuredClone(section.content),
      isDraft: true,
    }));
    const { scoped } = setUp({
      community: {
        communityType: 'condo_718',
        branding: { layoutId: 'bayfront', draftLook: { layoutId: 'heritage', themePresetSlug: 'heritage' } },
      },
      homeRows: [...published, ...heritageDrafts],
    });

    await draftLookSwitch(COMMUNITY_ID, 'palm-grove', { actorUserId: ACTOR });

    const palmGrove = look('palm-grove').sections.map(({ blockType, content }) => ({ blockType, content }));
    expect(afterPublish(published, insertedBlocks(scoped))).toEqual(palmGrove);
  });

  it('switching again to the drafted look leaves its drafts exactly as they are (Heritage to Plain & Simple, twice)', async () => {
    // A Heritage site whose only edit is Announcements 5 → 3.
    const published = publishedRows(look('heritage').sections);
    published[1] = { ...published[1]!, content: { limit: 3 } };
    const first = setUp({
      community: { communityType: 'condo_718', branding: { layoutId: 'heritage', themePresetSlug: 'heritage' } },
      homeRows: published,
    });

    await draftLookSwitch(COMMUNITY_ID, 'plain-simple', { actorUserId: ACTOR });

    const firstDrafts = insertedBlocks(first.scoped);
    const plain = look('plain-simple').sections;
    const sectionOf = (type: string) => {
      const found = plain.find((s) => s.blockType === type);
      return { blockType: type, content: found?.content };
    };
    // The edited Announcements kept its slot, before Meetings.
    expect(afterPublish(published, firstDrafts)).toEqual([
      sectionOf('hero'),
      sectionOf('quicklinks'),
      { blockType: 'announcements', content: { limit: 3 } },
      sectionOf('meetings'),
      sectionOf('documents'),
      sectionOf('contact'),
    ]);

    // "Publish this look" runs the switch again, with Plain & Simple drafted.
    // Its Announcements ({ limit: 3 }) now equals Plain & Simple's own default,
    // but nothing moves: no draft is cleared, written or tombstoned.
    vi.clearAllMocks();
    mocks.ensureHomePage.mockResolvedValue(HOME_PAGE_ID);
    mocks.listThemePresetsForWizard.mockResolvedValue(ALL_PRESETS);
    const firstDraftRows: BlockRow[] = firstDrafts.map((draft, i) => ({
      id: 800 + i,
      pageId: draft.pageId,
      blockType: draft.blockType,
      blockOrder: draft.blockOrder,
      content: draft.content,
      isDraft: true,
    }));
    const second = setUp({
      community: {
        communityType: 'condo_718',
        branding: {
          layoutId: 'heritage',
          themePresetSlug: 'heritage',
          draftLook: lookBranding('plain-simple'),
        },
      },
      homeRows: [...published, ...firstDraftRows],
    });

    const counts = await draftLookSwitch(COMMUNITY_ID, 'plain-simple', { actorUserId: ACTOR });

    expect(second.scoped.insert).not.toHaveBeenCalled();
    expect(second.scoped.softDelete).not.toHaveBeenCalled();
    expect(counts).toEqual({ replaced: 0, kept: 6, added: 0, removed: 0 });
    // Nothing is written for the look either, so no audit row.
    expect(mocks.mergeBranding).not.toHaveBeenCalled();
    expect(auditActions()).toEqual([]);
  });

  it('re-selecting the drafted look keeps a colour the manager changed since, and writes nothing', async () => {
    // Heritage was picked on its card, then the manager changed the drafted
    // primary colour. "Publish this look" runs the same switch again.
    const published = publishedRows(look('bayfront').sections);
    const heritageDrafts = look('heritage').sections.map((section, i) => ({
      id: 700 + i,
      pageId: HOME_PAGE_ID,
      blockType: section.blockType,
      blockOrder: i + 1,
      content: structuredClone(section.content),
      isDraft: true,
    }));
    const { scoped, tx } = setUp({
      community: {
        communityType: 'condo_718',
        branding: { ...lookBranding('bayfront'), draftLook: { ...lookBranding('heritage'), primaryColor: '#123456' } },
      },
      homeRows: [...published, ...heritageDrafts],
    });

    const counts = await draftLookSwitch(COMMUNITY_ID, 'heritage', { actorUserId: ACTOR });

    expect(counts).toEqual({ replaced: 0, kept: 6, added: 0, removed: 0 });
    // The drafted colour is not put back to the colour set's: nothing is saved
    // over the draft look, no section is written, and there is no audit row.
    expect(mocks.mergeBranding).not.toHaveBeenCalled();
    expect(scoped.insert).not.toHaveBeenCalled();
    expect(scoped.softDelete).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
    expect(tx.execute).toHaveBeenCalledTimes(1); // the lock, and nothing after it
  });

  describe('back to the live look', () => {
    /** A live Bayfront page whose manager removed Quick links: published slots 1, 3, 4, 5, 6. */
    function bayfrontWithoutQuickLinks(): BlockRow[] {
      return publishedRows(look('bayfront').sections).filter((row) => row.blockType !== 'quicklinks');
    }
    const liveBayfront = { communityType: 'condo_718', branding: lookBranding('bayfront') };

    /** Heritage drafted over that page, as the drafts a later read returns. */
    async function draftHeritage(published: BlockRow[]): Promise<BlockRow[]> {
      const { scoped } = setUp({ community: liveBayfront, homeRows: published });
      await draftLookSwitch(COMMUNITY_ID, 'heritage', { actorUserId: ACTOR });
      const drafts = insertedBlocks(scoped).map((draft, i) => ({
        id: 800 + i,
        pageId: draft.pageId,
        blockType: draft.blockType,
        blockOrder: draft.blockOrder,
        content: draft.content,
        isDraft: true,
      }));
      vi.clearAllMocks();
      return drafts;
    }
    const heritageDrafted = {
      communityType: 'condo_718',
      branding: { ...lookBranding('bayfront'), draftLook: lookBranding('heritage') },
    };

    it('choosing the live look with nothing drafted writes nothing at all', async () => {
      const { scoped, tx } = setUp({ community: liveBayfront, homeRows: bayfrontWithoutQuickLinks() });

      const counts = await draftLookSwitch(COMMUNITY_ID, 'bayfront', { actorUserId: ACTOR });

      expect(counts).toEqual({ replaced: 0, kept: 5, added: 0, removed: 0 });
      expect(scoped.softDelete).not.toHaveBeenCalled();
      expect(scoped.insert).not.toHaveBeenCalled();
      expect(mocks.mergeBranding).not.toHaveBeenCalled();
      expect(mocks.logAuditEvent).not.toHaveBeenCalled();
      expect(tx.execute).toHaveBeenCalledTimes(1); // the lock, and nothing after it
    });

    it('returning to it from Heritage leaves no Quick links, no other draft, and no pending design', async () => {
      const published = bayfrontWithoutQuickLinks();
      const drafts = await draftHeritage(published);
      expect(drafts.length).toBeGreaterThan(0);
      const { scoped, tx } = setUp({ community: heritageDrafted, homeRows: [...published, ...drafts] });

      await draftLookSwitch(COMMUNITY_ID, 'bayfront', { actorUserId: ACTOR });

      // Heritage's drafts are cleared and nothing is staged in their place, so a
      // publish would change nothing: the live page, Quick links still gone.
      expect(scoped.softDelete).toHaveBeenCalledTimes(1);
      expect(scoped.insert).not.toHaveBeenCalled();
      // The drafted look is withdrawn rather than Bayfront's colour set saved over
      // it: nothing about the design is pending.
      expect(mocks.mergeBranding).not.toHaveBeenCalled();
      expect(tx.execute.mock.calls.some(([query]) => JSON.stringify(query).includes('draftLook'))).toBe(true);
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType: 'community_site', metadata: expect.objectContaining({ kind: 'back-to-live' }) }),
        tx,
      );
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'site_design_draft_saved', newValues: { draftLook: {} } }),
        tx,
      );
    });

    it('an edit made while Heritage was drafted survives returning to Bayfront', async () => {
      const published = bayfrontWithoutQuickLinks();
      const drafts = await draftHeritage(published);
      // The manager edits Meetings under Heritage: a draft at its slot.
      const meetingsSlot = published.find((row) => row.blockType === 'meetings')!.blockOrder;
      const editedMeetings: BlockRow = {
        id: 950,
        pageId: HOME_PAGE_ID,
        blockType: 'meetings',
        blockOrder: meetingsSlot,
        content: { limit: 9 },
        isDraft: true,
      };
      const { scoped } = setUp({
        community: heritageDrafted,
        homeRows: [...published, ...drafts.filter((d) => d.blockOrder !== meetingsSlot), editedMeetings],
      });

      await draftLookSwitch(COMMUNITY_ID, 'bayfront', { actorUserId: ACTOR });

      // The live page again, with the edit as its one pending change.
      const staged = insertedBlocks(scoped);
      expect(staged).toEqual([
        expect.objectContaining({ blockType: 'meetings', blockOrder: meetingsSlot, content: { limit: 9 }, isDraft: true }),
      ]);
      expect(afterPublish(published, staged)).toEqual(
        published.map(({ blockType, content }) =>
          blockType === 'meetings' ? { blockType, content: { limit: 9 } } : { blockType, content },
        ),
      );
    });

    /**
     * A look's card, then the live look's card again, through the real staging:
     * what the way back stages, and what it does to the design. `between` is
     * what the manager does to the drafted page's rows in between.
     *
     * Each step has its own scoped client and transaction, so nothing is
     * cleared in between: `vi.clearAllMocks` walks every mock ever made, and
     * the loops below would make it the slowest part of the suite.
     */
    async function cardThenLiveCard(
      liveId: LookId,
      toId: LookId,
      published: BlockRow[],
      between: (drafts: BlockRow[]) => BlockRow[] = (drafts) => drafts,
    ) {
      const forward = setUp({ community: { communityType: 'condo_718', branding: lookBranding(liveId) }, homeRows: published });
      await draftLookSwitch(COMMUNITY_ID, toId, { actorUserId: ACTOR });
      const drafts = insertedBlocks(forward.scoped).map((draft, i) => ({ id: 800 + i, ...draft }));
      const back = setUp({
        community: { communityType: 'condo_718', branding: { ...lookBranding(liveId), draftLook: lookBranding(toId) } },
        homeRows: [...published, ...between(drafts)],
      });
      const savesBefore = mocks.mergeBranding.mock.calls.length;
      await draftLookSwitch(COMMUNITY_ID, liveId, { actorUserId: ACTOR });
      return {
        draftedRows: drafts.length,
        staged: insertedBlocks(back.scoped),
        designSaved: mocks.mergeBranding.mock.calls.length > savesBefore,
        designWithdrawn: back.tx.execute.mock.calls.some(([query]) => JSON.stringify(query).includes('draftLook')),
      };
    }

    /** The drafted hero, edited by the manager: a new draft in slot 1. */
    const heroEdited = (drafts: BlockRow[]): BlockRow[] => [
      ...drafts.filter((draft) => draft.blockOrder !== 1),
      { id: 990, pageId: HOME_PAGE_ID, blockType: 'hero', blockOrder: 1, content: { headline: 'Harbor Pointe' }, isDraft: true },
    ];

    it('one edit between the clicks is the one change staged, in place (Plain & Simple, Heritage, hero edited, back)', async () => {
      const result = await cardThenLiveCard('plain-simple', 'heritage', publishedRows(look('plain-simple').sections), heroEdited);

      expect(result.draftedRows).toBeGreaterThan(0);
      // Exactly that edit, in slot 1: no reorder, no tombstone, no design pending.
      expect(result.staged).toEqual([
        expect.objectContaining({ blockType: 'hero', blockOrder: 1, content: { headline: 'Harbor Pointe' }, isDraft: true }),
      ]);
      expect(result.designSaved).toBe(false);
      expect(result.designWithdrawn).toBe(true);
    });

    describe('for any live page with sections of one type twice', () => {
      const QUICK_LINKS: LookSection = { blockType: 'quicklinks', content: {} };
      const text = (body: string): LookSection => ({ blockType: 'text', content: { body } });
      /** `content` with `a` inserted before index `p` and `b` before index `q` (p ≤ q), so `a` comes first. */
      const insertTwo = (content: readonly LookSection[], p: number, q: number, a: LookSection, b: LookSection) => {
        const out = [...content];
        out.splice(q, 0, b);
        out.splice(p, 0, a);
        return out;
      };

      /**
       * Live pages of a look: two text sections (different, then the same) at
       * every pair of places, Quick links twice, both at once, and the first
       * with a gap in the slots (a section removed and published).
       */
      function livePages(liveId: LookId): Array<{ name: string; rows: BlockRow[] }> {
        const [hero, ...content] = look(liveId).sections;
        const hasQuickLinks = content.some((s) => s.blockType === 'quicklinks');
        const pages: Array<{ name: string; rows: BlockRow[] }> = [];
        const add = (name: string, sections: LookSection[], slots?: number[]) =>
          pages.push({ name, rows: publishedRows([hero!, ...sections], 500, slots) });
        for (let p = 0; p <= content.length; p += 1) {
          if (hasQuickLinks) add(`Quick links again at ${p}`, [...content.slice(0, p), QUICK_LINKS, ...content.slice(p)]);
          for (let q = p; q <= content.length; q += 1) {
            const texts = insertTwo(content, p, q, text('About us'), text('Pool hours'));
            add(`texts at ${p},${q}`, texts);
            add(`identical texts at ${p},${q}`, insertTwo(content, p, q, text('Same'), text('Same')));
            add(
              `texts at ${p},${q} and Quick links twice`,
              hasQuickLinks ? [...texts, QUICK_LINKS] : [QUICK_LINKS, QUICK_LINKS, ...texts],
            );
            add(`texts at ${p},${q}, slot 2 empty`, texts, [1, ...texts.map((_, i) => i + 3)]);
            if (!hasQuickLinks) add(`Quick links twice at ${p},${q}`, insertTwo(content, p, q, QUICK_LINKS, QUICK_LINKS));
          }
        }
        return pages;
      }

      it.each([...LOOK_IDS])('live %s: nothing pending after any card and back, and only an edit made in between', async (liveId) => {
        const failures: string[] = [];
        let roundTrips = 0;
        for (const { name, rows } of livePages(liveId)) {
          for (const toId of LOOK_IDS.filter((id) => id !== liveId)) {
            const label = `${liveId} → ${toId} → ${liveId}, ${name}`;
            const plain = await cardThenLiveCard(liveId, toId, rows);
            const edit = await cardThenLiveCard(liveId, toId, rows, heroEdited);
            roundTrips += 2;
            if (plain.draftedRows === 0) failures.push(`${label}: the card staged nothing`);
            if (plain.staged.length > 0) failures.push(`${label}: ${plain.staged.length} rows staged on the way back`);
            if (plain.designSaved || !plain.designWithdrawn) failures.push(`${label}: design still pending`);
            const onlyTheEdit =
              edit.staged.length === 1 &&
              edit.staged[0]!.blockType === 'hero' &&
              edit.staged[0]!.blockOrder === 1 &&
              JSON.stringify(edit.staged[0]!.content) === JSON.stringify({ headline: 'Harbor Pointe' });
            if (!onlyTheEdit) failures.push(`${label}, hero edited: staged ${JSON.stringify(edit.staged.map((s) => [s.blockOrder, s.blockType]))}`);
          }
        }
        expect(failures).toEqual([]);
        // Not vacuous: dozens of pages, each with every other look.
        expect(roundTrips).toBeGreaterThan(300);
      });
    });
  });

  it('stages the removal of a published slot the new look leaves empty', async () => {
    // Bayfront has six sections and Palm Grove five: slot 6 gets a tombstone,
    // the editor's staged removal, so Publish leaves no sixth section.
    const published = publishedRows(look('bayfront').sections);
    const { scoped } = setUp({
      community: { communityType: 'hoa_720', branding: { layoutId: 'bayfront' } },
      homeRows: published,
    });

    await draftLookSwitch(COMMUNITY_ID, 'palm-grove', { actorUserId: ACTOR });

    const drafts = insertedBlocks(scoped);
    expect(drafts.filter((d) => d.blockType === TOMBSTONE_BLOCK_TYPE)).toEqual([
      expect.objectContaining({ blockOrder: 6, isDraft: true, publishedAt: null, content: {} }),
    ]);
    const palmGrove = look('palm-grove').sections.map(({ blockType, content }) => ({ blockType, content }));
    expect(afterPublish(published, drafts)).toEqual(palmGrove);
  });

  it('reads every starter-pack version for a site on a legacy layout', async () => {
    const condoV1: LookSection[] = [
      { blockType: 'hero', content: { headline: 'Welcome', subtitle: 'A welcoming Florida community.' } },
      { blockType: 'announcements', content: { limit: 5, timeWindowDays: 30 } },
      { blockType: 'contact', content: { showBoard: true, showManagement: true } },
    ];
    const condoV2: LookSection[] = [{ blockType: 'meetings', content: { limit: 10, timeWindowDays: 30 } }];
    const published = publishedRows([...condoV1, ...condoV2]);
    const { scoped, whereFor } = setUp(
      { community: { communityType: 'condo_718', branding: { layoutId: 'tidewater' } }, homeRows: published },
      {
        packs: [
          { blocks: condoV1.map((s, i) => ({ ...s, blockOrder: i + 1 })) },
          { blocks: condoV2.map((s, i) => ({ ...s, blockOrder: i + 2 })) },
        ],
      },
    );

    await draftLookSwitch(COMMUNITY_ID, 'plain-simple', { actorUserId: ACTOR });

    // Every version for the community type, archived ones included: a site may
    // have received any of them.
    expect(whereFor.get(siteStarterPacksTable)).toEqual({
      __eq: ['site_starter_packs.community_type', 'condo_718'],
    });
    // Every section came from a pack, so the site becomes Plain & Simple exactly.
    const plain = look('plain-simple').sections.map(({ blockType, content }) => ({ blockType, content }));
    expect(afterPublish(published, insertedBlocks(scoped))).toEqual(plain);
  });

  it("refuses before writing anything when the look's colour set is missing", async () => {
    mocks.listThemePresetsForWizard.mockResolvedValue(ALL_PRESETS.filter((p) => p.slug !== 'heritage'));
    const { client } = setUp({ community: { communityType: 'condo_718', branding: {} } });

    await expect(draftLookSwitch(COMMUNITY_ID, 'heritage', { actorUserId: ACTOR })).rejects.toThrow(
      'That colour set does not exist',
    );

    expect(client.transaction).not.toHaveBeenCalled();
    expect(mocks.mergeBranding).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// loadLookSwitchInput
// ---------------------------------------------------------------------------

describe('loadLookSwitchInput', () => {
  it('reads what a switch is planned from, and writes nothing', async () => {
    const condoV1: LookSection[] = [
      { blockType: 'hero', content: { headline: 'Welcome' } },
      { blockType: 'announcements', content: { limit: 5, timeWindowDays: 30 } },
    ];
    const rows: BlockRow[] = [
      ...publishedRows([...condoV1, { blockType: 'contact', content: { showBoard: true, showManagement: true } }]),
      // A pending edit over slot 2, and a staged removal over slot 3.
      { id: 900, pageId: HOME_PAGE_ID, blockType: 'announcements', blockOrder: 2, content: { limit: 4 }, isDraft: true },
      { id: 901, pageId: HOME_PAGE_ID, blockType: TOMBSTONE_BLOCK_TYPE, blockOrder: 3, content: {}, isDraft: true },
    ];
    const { scoped, client, whereFor } = setUp(
      { community: { communityType: 'condo_718', branding: { layoutId: 'tidewater' } }, homeRows: rows },
      { packs: [{ blocks: condoV1.map((s, i) => ({ ...s, blockOrder: i + 1 })) }] },
    );

    const input = await loadLookSwitchInput(COMMUNITY_ID);

    expect(input).toMatchObject({
      homePageId: HOME_PAGE_ID,
      // What the editor shows: the draft over slot 2 (in that slot), slot 3 gone.
      current: [
        { id: 500, slot: 1, blockType: 'hero', content: { headline: 'Welcome' } },
        { id: 900, slot: 2, blockType: 'announcements', content: { limit: 4 } },
      ],
      outgoingDefaults: [condoV1],
      outgoingLayoutId: 'tidewater',
      draftedLookId: null,
      // A legacy live layout: no card returns to it.
      live: null,
    });
    expect(whereFor.get(siteStarterPacksTable)).toEqual({ __eq: ['site_starter_packs.community_type', 'condo_718'] });
    // Read only: no transaction, no home page created, no row written.
    expect(client.transaction).not.toHaveBeenCalled();
    expect(mocks.ensureHomePage).not.toHaveBeenCalled();
    expect(scoped.insert).not.toHaveBeenCalled();
    expect(scoped.update).not.toHaveBeenCalled();
    expect(scoped.softDelete).not.toHaveBeenCalled();
  });

  it('names the drafted look, and plans from it rather than the live one', async () => {
    const { selectedTables } = setUp({
      community: {
        communityType: 'condo_718',
        branding: { layoutId: 'tidewater', draftLook: { layoutId: 'heritage' } },
      },
    });

    const input = await loadLookSwitchInput(COMMUNITY_ID);

    expect(input.draftedLookId).toBe('heritage');
    expect(input.outgoingLayoutId).toBe('heritage');
    expect(input.outgoingDefaults).toEqual([look('heritage').sections]);
    expect(selectedTables).not.toContain(siteStarterPacksTable);
  });

  it('describes the live look: its published sections in live order, and whether another layout is drafted over it', async () => {
    const published = publishedRows(look('bayfront').sections).filter((row) => row.blockType !== 'quicklinks');
    const pendingEdit: BlockRow = {
      id: 900,
      pageId: HOME_PAGE_ID,
      blockType: 'meetings',
      blockOrder: 4,
      content: { limit: 9 },
      isDraft: true,
    };
    const withBranding = (branding: Record<string, unknown>) =>
      setUp({ community: { communityType: 'condo_718', branding }, homeRows: [...published, pendingEdit] });

    withBranding(lookBranding('bayfront'));
    expect((await loadLookSwitchInput(COMMUNITY_ID)).live).toEqual({
      lookId: 'bayfront',
      // Published rows only, in slot order: a pending edit is not live. Each
      // with its id and slot, which the way back matches the drafts to.
      sections: published.map(({ id, blockOrder, blockType, content }) => ({ id, slot: blockOrder, blockType, content })),
      otherLayoutDrafted: false,
    });

    // A colour drafted on its own drafts no other layout; a look does.
    withBranding({ ...lookBranding('bayfront'), draftLook: { primaryColor: '#000000' } });
    expect((await loadLookSwitchInput(COMMUNITY_ID)).live?.otherLayoutDrafted).toBe(false);
    withBranding({ ...lookBranding('bayfront'), draftLook: { layoutId: 'heritage' } });
    expect((await loadLookSwitchInput(COMMUNITY_ID)).live?.otherLayoutDrafted).toBe(true);
  });

  it('has no sections for a community with no home page yet', async () => {
    const { scoped } = setUp({
      community: { communityType: 'apartment', branding: { layoutId: 'plain-simple' } },
      homePageId: null,
    });

    const input = await loadLookSwitchInput(COMMUNITY_ID);

    expect(input.homePageId).toBeNull();
    expect(input.current).toEqual([]);
    expect(scoped.queryWhere).toHaveBeenCalledTimes(1); // the home page lookup only
  });
});
