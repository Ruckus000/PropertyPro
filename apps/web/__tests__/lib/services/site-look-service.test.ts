/**
 * The look service: a new community's suggested look, published at creation,
 * and a look switch saved as a draft.
 *
 * The statements are mocked here; what they do against Postgres (the switch
 * planned from the draft look, then published by the editor's own publish) is
 * site-look-switch.integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createScopedClient: vi.fn(),
  createUnscopedClient: vi.fn(),
  logAuditEvent: vi.fn(),
  ensureHomePage: vi.fn(),
  saveDraftDesign: vi.fn(),
  updateBrandingForCommunity: vi.fn(),
  listThemePresetsForWizard: vi.fn(),
}));

// vi.importActual cannot be used: the real @propertypro/db needs DATABASE_URL at
// load. Every export the service reads is stubbed.
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
  sitePages: { id: 'site_pages.id', isDraft: 'site_pages.is_draft' },
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
vi.mock('@/lib/services/site-design-service', () => ({ saveDraftDesign: mocks.saveDraftDesign }));
vi.mock('@/lib/api/branding', () => ({ updateBrandingForCommunity: mocks.updateBrandingForCommunity }));
vi.mock('@/lib/db/theme-preset-catalog', () => ({
  listThemePresetsForWizard: mocks.listThemePresetsForWizard,
}));

import { TOMBSTONE_BLOCK_TYPE } from '@propertypro/shared';
import {
  communities as communitiesTable,
  sitePages as sitePagesTable,
  siteStarterPacks as siteStarterPacksTable,
} from '@propertypro/db';
import { applyLookAtCreation, draftLookSwitch } from '@/lib/services/site-look-service';
import { getLook, type LookSection } from '@/lib/site-looks/looks';
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

/** A look's sections as published rows at slots 1, 2, 3 … */
function publishedRows(sections: readonly LookSection[], firstId = 500): BlockRow[] {
  return sections.map((section, i) => ({
    id: firstId + i,
    pageId: HOME_PAGE_ID,
    blockType: section.blockType,
    blockOrder: i + 1,
    content: structuredClone(section.content),
    isDraft: false,
  }));
}

function presetRow(slug: keyof typeof SITE_LOOK_PRESETS) {
  return {
    id: 1,
    slug,
    displayName: slug,
    description: null,
    tokens: SITE_LOOK_PRESETS[slug],
    tier: 'essentials' as const,
    isFeatured: true,
  };
}

/** The four look presets, as the catalog reader returns them. */
const ALL_PRESETS = (Object.keys(SITE_LOOK_PRESETS) as (keyof typeof SITE_LOOK_PRESETS)[]).map(presetRow);

function buildScoped(queryResults: unknown[][]) {
  const queryWhere = vi.fn();
  for (const result of queryResults) queryWhere.mockResolvedValueOnce(result);
  queryWhere.mockResolvedValue([]);
  return {
    queryWhere,
    insert: vi.fn(async (_table: unknown, _values: InsertedBlock) => [{ id: 1 }]),
    softDelete: vi.fn(async (_table: unknown, _where: unknown) => []),
  };
}

/**
 * A transaction double: `select().from(table).where()` answers by table (the
 * community row, or the starter packs), and every `update` is recorded.
 */
function buildTx(opts: { community?: unknown; packs?: unknown[] } = {}) {
  const updates: Array<{ table: unknown; values: Record<string, unknown>; where: unknown }> = [];
  const selectedTables: unknown[] = [];
  const whereFor = new Map<unknown, unknown>();
  const tx = {
    execute: vi.fn(async (_query: unknown) => []),
    select: vi.fn((_fields: unknown) => ({
      from: vi.fn((table: unknown) => {
        selectedTables.push(table);
        return {
          where: vi.fn((predicate: unknown) => {
            whereFor.set(table, predicate);
            const rows =
              table === communitiesTable
                ? opts.community === undefined
                  ? []
                  : [opts.community]
                : table === siteStarterPacksTable
                  ? (opts.packs ?? [])
                  : [];
            return Object.assign(Promise.resolve(rows), { limit: vi.fn(async () => rows) });
          }),
        };
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async (where: unknown) => {
          updates.push({ table, values, where });
          return [];
        }),
      })),
    })),
  };
  const client = { transaction: vi.fn(async (run: (t: typeof tx) => unknown) => run(tx)) };
  return { tx, client, updates, selectedTables, whereFor };
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureHomePage.mockResolvedValue(HOME_PAGE_ID);
  mocks.listThemePresetsForWizard.mockResolvedValue(ALL_PRESETS);
  mocks.saveDraftDesign.mockResolvedValue({ live: {}, draft: {} });
  mocks.updateBrandingForCommunity.mockResolvedValue({});
  mocks.logAuditEvent.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// applyLookAtCreation
// ---------------------------------------------------------------------------

describe('applyLookAtCreation', () => {
  it('applyLookAtCreation skips a community that already has published blocks', async () => {
    const scoped = buildScoped([[{ id: 1, isDraft: false }]]);
    mocks.createScopedClient.mockReturnValue(scoped);
    const { client } = buildTx();
    mocks.createUnscopedClient.mockReturnValue(client);

    const result = await applyLookAtCreation(COMMUNITY_ID, 'condo_718');

    expect(result).toEqual({ applied: false, lookId: 'bayfront' });
    expect(client.transaction).not.toHaveBeenCalled();
    expect(scoped.insert).not.toHaveBeenCalled();
    expect(mocks.updateBrandingForCommunity).not.toHaveBeenCalled();
  });

  it('applyLookAtCreation writes layout, preset, colours and fonts, publishes the sections, and stamps site_published_at only when null', async () => {
    const scoped = buildScoped([[], []]);
    mocks.createScopedClient.mockReturnValue(scoped);
    const { tx, client, updates } = buildTx();
    mocks.createUnscopedClient.mockReturnValue(client);

    const result = await applyLookAtCreation(COMMUNITY_ID, 'hoa_720');

    expect(result).toEqual({ applied: true, lookId: 'palm-grove' });

    // Branding: the look's layout and colour set, and the set's colours and
    // fonts under the names the renderer reads.
    const tokens = SITE_LOOK_PRESETS['palm-grove'];
    expect(mocks.updateBrandingForCommunity).toHaveBeenCalledWith(COMMUNITY_ID, {
      layoutId: 'palm-grove',
      themePresetSlug: 'palm-grove',
      primaryColor: tokens.primaryColor,
      secondaryColor: tokens.secondaryColor,
      accentColor: tokens.accentColor,
      fontHeading: tokens.headingFont,
      fontBody: tokens.bodyFont,
    });

    // Under the community row lock, on a published home page.
    expect(JSON.stringify(tx.execute.mock.calls[0]?.[0])).toContain('FOR UPDATE');
    expect(mocks.ensureHomePage).toHaveBeenCalledWith(COMMUNITY_ID, tx, { publishedAt: expect.any(Date) });
    const now = (mocks.ensureHomePage.mock.calls[0]?.[2] as { publishedAt: Date }).publishedAt;
    expect(updates).toContainEqual({
      table: sitePagesTable,
      values: { isDraft: false, publishedAt: now },
      where: expect.anything(),
    });

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
    const scoped = buildScoped([[], [{ id: 1, isDraft: false }]]);
    mocks.createScopedClient.mockReturnValue(scoped);
    const { client, updates } = buildTx();
    mocks.createUnscopedClient.mockReturnValue(client);

    const result = await applyLookAtCreation(COMMUNITY_ID, 'apartment');

    expect(result).toEqual({ applied: false, lookId: 'plain-simple' });
    expect(scoped.insert).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('writes the branding first, so a retry can finish a site whose sections failed to publish', async () => {
    const scoped = buildScoped([[], [], [], []]);
    mocks.createScopedClient.mockReturnValue(scoped);
    const failing = { transaction: vi.fn(async () => Promise.reject(new Error('connection reset'))) };
    mocks.createUnscopedClient.mockReturnValueOnce(failing);

    await expect(applyLookAtCreation(COMMUNITY_ID, 'condo_718')).rejects.toThrow('connection reset');
    // The look's branding is already there, so the site is not left on the
    // type's legacy layout behind sections a retry would skip.
    expect(mocks.updateBrandingForCommunity).toHaveBeenCalledTimes(1);

    const { client } = buildTx();
    mocks.createUnscopedClient.mockReturnValue(client);
    expect(await applyLookAtCreation(COMMUNITY_ID, 'condo_718')).toEqual({ applied: true, lookId: 'bayfront' });
    expect(scoped.insert).toHaveBeenCalledTimes(look('bayfront').sections.length);
  });

  it("refuses before writing anything when the look's colour set is missing", async () => {
    mocks.listThemePresetsForWizard.mockResolvedValue([]);
    const scoped = buildScoped([[]]);
    mocks.createScopedClient.mockReturnValue(scoped);
    const { client } = buildTx();
    mocks.createUnscopedClient.mockReturnValue(client);

    await expect(applyLookAtCreation(COMMUNITY_ID, 'condo_718')).rejects.toThrow(/bayfront/);

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
    const scoped = buildScoped([[...published, editedMeetings]]);
    mocks.createScopedClient.mockReturnValue(scoped);
    const { tx, client, updates, selectedTables } = buildTx({
      community: { communityType: 'condo_718', branding: { layoutId: 'bayfront', themePresetSlug: 'bayfront' } },
    });
    mocks.createUnscopedClient.mockReturnValue(client);

    const counts = await draftLookSwitch(COMMUNITY_ID, 'heritage', { actorUserId: ACTOR });

    // The look itself goes into the draft look, through the design draft.
    expect(mocks.saveDraftDesign).toHaveBeenCalledWith(
      COMMUNITY_ID,
      { layoutId: 'heritage', themePresetSlug: 'heritage' },
      { actorUserId: ACTOR },
    );

    // Nothing live: no live branding write, no UPDATE of any row (publishing is
    // an UPDATE), and every row written is a draft.
    expect(mocks.updateBrandingForCommunity).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
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

    // Audited in the same transaction as the drafts.
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
    // Bayfront is live and Heritage was drafted over it. Switching to Bayfront
    // treats Heritage's sections as untouched, so the draft layer is cleared and
    // the live Bayfront sections stand.
    const published = publishedRows(look('bayfront').sections);
    const heritageDrafts = look('heritage').sections.map((section, i) => ({
      id: 700 + i,
      pageId: HOME_PAGE_ID,
      blockType: section.blockType,
      blockOrder: i + 1,
      content: structuredClone(section.content),
      isDraft: true,
    }));
    const scoped = buildScoped([[...published, ...heritageDrafts]]);
    mocks.createScopedClient.mockReturnValue(scoped);
    const { client } = buildTx({
      community: {
        communityType: 'condo_718',
        branding: { layoutId: 'bayfront', draftLook: { layoutId: 'heritage', themePresetSlug: 'heritage' } },
      },
    });
    mocks.createUnscopedClient.mockReturnValue(client);

    await draftLookSwitch(COMMUNITY_ID, 'bayfront', { actorUserId: ACTOR });

    expect(scoped.softDelete).toHaveBeenCalledTimes(1);
    expect(insertedBlocks(scoped)).toEqual([]);
  });

  it('stages the removal of a published slot the new look leaves empty', async () => {
    // Bayfront has six sections and Palm Grove five: slot 6 gets a tombstone,
    // the editor's staged removal, so Publish leaves no sixth section.
    const published = publishedRows(look('bayfront').sections);
    const scoped = buildScoped([published]);
    mocks.createScopedClient.mockReturnValue(scoped);
    const { client } = buildTx({ community: { communityType: 'hoa_720', branding: { layoutId: 'bayfront' } } });
    mocks.createUnscopedClient.mockReturnValue(client);

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
    const scoped = buildScoped([published]);
    mocks.createScopedClient.mockReturnValue(scoped);
    const { client, whereFor } = buildTx({
      community: { communityType: 'condo_718', branding: { layoutId: 'tidewater' } },
      packs: [
        { blocks: condoV1.map((s, i) => ({ ...s, blockOrder: i + 1 })) },
        { blocks: condoV2.map((s, i) => ({ ...s, blockOrder: i + 2 })) },
      ],
    });
    mocks.createUnscopedClient.mockReturnValue(client);

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
    const scoped = buildScoped([]);
    mocks.createScopedClient.mockReturnValue(scoped);
    const { client } = buildTx({ community: { communityType: 'condo_718', branding: {} } });
    mocks.createUnscopedClient.mockReturnValue(client);

    await expect(draftLookSwitch(COMMUNITY_ID, 'heritage', { actorUserId: ACTOR })).rejects.toThrow(/heritage/);

    expect(client.transaction).not.toHaveBeenCalled();
    expect(mocks.saveDraftDesign).not.toHaveBeenCalled();
  });
});
