/**
 * Looks, applied to a community's website (website builder, Phase 2B).
 *
 * - `applyLookAtCreation`: a new community goes live with its suggested look
 *   (D6). The look's layout, colour set, colours and fonts are written live, and
 *   its sections are published on a published home page.
 * - `draftLookSwitch`: the manager picks a look (D9). It is saved as a DRAFT in
 *   the editor's own draft layer: the home page's sections as draft rows and
 *   tombstones, the look as `branding.draftLook`. The editor's Publish makes it
 *   live and its Discard throws it away, both unchanged.
 *
 * What a switch does to the home page is `planLookSwitch` in
 * `@/lib/site-looks/looks` (D5); this file only reads what it needs and writes
 * what it returns.
 *
 * AUTHZ: callers authorize. `applyLookAtCreation` runs for a community the
 * caller has just created, or a demo it is provisioning, before anyone is a
 * member of it (the same footing as `applyStarterPackToCommunity`). The caller
 * of `draftLookSwitch` has verified a manager role in the community and the
 * `hasSiteEditor` plan feature (the website routes' gate).
 */
import {
  communities,
  createScopedClient,
  logAuditEvent,
  siteBlocks,
  sitePages,
  siteStarterPacks,
} from '@propertypro/db';
import { and, eq, isNull, sql } from '@propertypro/db/filters';
// AUTHZ: opens the transaction that holds the community row lock and reads the platform-level site_starter_packs catalog (no community_id); every site write runs through createScopedClient(communityId, tx) or logAuditEvent(..., tx), and callers authorize as the docblock says.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import {
  TOMBSTONE_BLOCK_TYPE,
  effectiveLook,
  fingerprint,
  type BlockType,
  type CommunityBranding,
  type CommunityType,
} from '@propertypro/shared';
import { updateBrandingForCommunity, type BrandingPatch } from '@/lib/api/branding';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { listThemePresetsForWizard, type ThemePresetForWizard } from '@/lib/db/theme-preset-catalog';
import { applyPresetTokensToBranding } from '@/lib/public-site/preview-overrides';
import { saveDraftDesign } from '@/lib/services/site-design-service';
import { ensureHomePage } from '@/lib/services/site-pages-service';
import {
  getLook,
  lookIdForLayout,
  planLookSwitchWithCounts,
  suggestedLookFor,
  type LookDefinition,
  type LookId,
  type LookSection,
  type LookSwitchCounts,
  type SiteSection,
} from '@/lib/site-looks/looks';

type UnscopedDb = ReturnType<typeof createUnscopedClient>;
/** The drizzle transaction handle, the same alias site-pages-service uses. */
type Tx = Parameters<Parameters<UnscopedDb['transaction']>[0]>[0];
/** A handle `createScopedClient` and `logAuditEvent` both accept: the pool's, or a transaction's. */
type Executor = NonNullable<Parameters<typeof createScopedClient>[1]>;
type ScopedClient = ReturnType<typeof createScopedClient>;

/** The hero is in slot 1; every other section takes 2, 3, … in order. */
const HERO_SLOT = 1;
const FIRST_CONTENT_SLOT = 2;

/** A home-page row, as the switch reads it. */
interface HomeRow {
  id: number;
  blockType: string;
  blockOrder: number;
  content: unknown;
  isDraft: boolean;
}

/**
 * Publish a new community's suggested look (D6): its layout, colour set,
 * colours and fonts written live, and its sections published on a published
 * home page.
 *
 * Idempotent the way the starter pack it replaces is: a community with any
 * published section is left alone, checked again under the community row lock,
 * so racing calls publish the look once. `site_published_at` is stamped with
 * the sections' own moment and only when it is unset, as migration 0043 and the
 * starter pack stamp it. `site_onboarding_completed_at` stays null, so the
 * dashboard still offers to pick a different look.
 *
 * The branding is written before the sections, so a failure part-way leaves
 * something a retry can finish: the retry re-checks for published sections and
 * writes the same branding again. The other order could leave published
 * sections, which every retry skips, on the community type's legacy layout.
 *
 * Throws, having written nothing, when the look's colour set is missing from
 * `site_theme_presets` (see `requirePreset`): a site without its look's colours
 * and fonts is not the look.
 */
export async function applyLookAtCreation(
  communityId: number,
  communityType: CommunityType,
): Promise<{ applied: boolean; lookId: LookId }> {
  const look = requireLook(suggestedLookFor(communityType));
  const lookId = look.id;
  // Unlocked fast path: a provisioning retry, or a community that has a site.
  if (await hasPublishedSections(createScopedClient(communityId))) return { applied: false, lookId };

  const preset = await requirePreset(look);
  await updateBrandingForCommunity(communityId, lookBranding(look, preset));

  const applied = await withCommunityLock(communityId, async (tx, scoped) => {
    // Again under the lock: a racing call may have published the look since.
    if (await hasPublishedSections(scoped)) return false;

    const now = new Date();
    // Published with the sections' own stamp: anon RLS hides a draft page while
    // its published sections would still be served.
    const homePageId = await ensureHomePage(communityId, tx, { publishedAt: now });
    // A draft home page can already exist (the editor was opened first), and
    // `ensureHomePage` never flips an existing draft live.
    await tx
      .update(sitePages)
      .set({ isDraft: false, publishedAt: now })
      .where(and(eq(sitePages.id, homePageId), eq(sitePages.isDraft, true)));

    for (const [slot, lookSection] of slotted(look.sections)) {
      await scoped.insert(siteBlocks, {
        communityId,
        pageId: homePageId,
        blockType: lookSection.blockType,
        blockOrder: slot,
        isDraft: false,
        publishedAt: now,
        content: lookSection.content as Record<string, unknown>,
      });
    }

    // Building the site at creation IS a publish, so it stamps what
    // `publishCommunitySite` stamps; the urgent-notice gate reads it.
    await tx
      .update(communities)
      .set({ sitePublishedAt: now })
      .where(and(eq(communities.id, communityId), isNull(communities.sitePublishedAt)));
    return true;
  });

  return { applied, lookId };
}

/**
 * Save a switch to `lookId` as a draft (D9): the home page as `planLookSwitch`
 * leaves it, and the look's layout, colour set, colours and fonts as
 * `branding.draftLook`. Nothing live changes until the editor's Publish, and
 * its Discard throws the switch away. Other pages are not touched.
 *
 * Planned from what the editor shows (each slot's draft over its published
 * row) and from the look being left: the drafted look when there is one, else
 * the live one. When that is a legacy layout, the defaults the site could have
 * received are every version of its community type's starter pack, read only
 * then.
 *
 * The sections are written the way the editor's own writers stage a change, in
 * one transaction under the community row lock (`writeHomeDrafts`), so
 * publishing them leaves exactly the plan.
 *
 * Idempotent: run again for the same look, it plans the same page from its own
 * drafts, so `POST /look` can always run it before publishing.
 *
 * The look is saved after the sections, through `saveDraftDesign` (its own
 * statement and audit row). If that fails, the new sections wait under the old
 * look until a retry saves it (the retry keeps them) or Discard drops both. The
 * colour set is checked before anything is written, so a missing one fails the
 * switch cleanly.
 */
export async function draftLookSwitch(
  communityId: number,
  lookId: LookId,
  opts: { actorUserId: string },
): Promise<LookSwitchCounts> {
  const incoming = requireLook(lookId);
  await requirePreset(incoming);

  const counts = await withCommunityLock(communityId, async (tx, scoped) => {
    const [community] = await tx
      .select({ communityType: communities.communityType, branding: communities.branding })
      .from(communities)
      .where(eq(communities.id, communityId))
      .limit(1);
    if (!community) throw new NotFoundError('Community not found');

    const homePageId = await ensureHomePage(communityId, tx);
    const { current, published } = readHomePage(
      await scoped.queryWhere(siteBlocks, eq(siteBlocks.pageId, homePageId)),
    );

    const branding = (community.branding ?? {}) as CommunityBranding;
    const outgoingLayoutId = effectiveLook(branding, { includeDraft: true }).layoutId ?? null;
    const outgoingLookId = lookIdForLayout(outgoingLayoutId);
    const outgoingDefaults = outgoingLookId
      ? [requireLook(outgoingLookId).sections]
      : await starterPackVersions(tx, community.communityType);

    const { sections, ...switchCounts } = planLookSwitchWithCounts({ current, outgoingDefaults, incoming });
    await writeHomeDrafts(scoped, communityId, homePageId, published, sections);

    await logAuditEvent(
      {
        userId: opts.actorUserId,
        communityId,
        action: 'update',
        resourceType: 'community_site',
        resourceId: String(communityId),
        metadata: {
          lookSwitch: true,
          lookId: incoming.id,
          fromLayoutId: outgoingLayoutId,
          pageId: homePageId,
          ...switchCounts,
        },
      },
      tx as unknown as Executor,
    );
    return switchCounts;
  });

  await saveDraftDesign(
    communityId,
    { layoutId: incoming.layoutId, themePresetSlug: incoming.presetSlug },
    { actorUserId: opts.actorUserId },
  );
  return counts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireLook(id: LookId): LookDefinition {
  const look = getLook(id);
  if (!look) {
    throw new ValidationError('That look does not exist', {
      fields: [{ field: 'lookId', message: 'Unknown look' }],
    });
  }
  return look;
}

/**
 * The look's colour set, which holds its colours and fonts. Missing only when
 * migration 0097 has not been applied or a platform admin has archived the set;
 * `saveDraftDesign` refuses such a set too, so this is checked before anything
 * is written.
 */
async function requirePreset(look: LookDefinition): Promise<ThemePresetForWizard> {
  const preset = (await listThemePresetsForWizard()).find((p) => p.slug === look.presetSlug);
  if (!preset) {
    throw new Error(
      `The ${look.name} look's colour set "${look.presetSlug}" is not in site_theme_presets (migration 0097).`,
    );
  }
  return preset;
}

/**
 * The live branding a look writes: its layout and colour set, and the set's
 * colours and fonts under the names the renderer reads (`headingFont` becomes
 * `fontHeading`), mapped the way `saveDraftDesign` maps them for a draft.
 */
function lookBranding(look: LookDefinition, preset: ThemePresetForWizard): BrandingPatch {
  const tokens = (applyPresetTokensToBranding({}, preset.tokens) ?? {}) as BrandingPatch;
  return { ...tokens, layoutId: look.layoutId, themePresetSlug: look.presetSlug };
}

/**
 * Runs `work` in one transaction holding the community row lock, the lock every
 * site writer takes first (publish, the editor's writers, `ensureHomePage`'s
 * callers), with a client scoped to the community on that transaction.
 *
 * The one use of the unscoped client in this file: it opens the transaction.
 * Statements inside go through the scoped client or `tx`, and on `tx` only, so
 * none waits on the pool for a second connection while this one is held.
 */
async function withCommunityLock<T>(
  communityId: number,
  work: (tx: Tx, scoped: ScopedClient) => Promise<T>,
): Promise<T> {
  return createUnscopedClient().transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM communities WHERE id = ${communityId} FOR UPDATE`);
    return work(tx, createScopedClient(communityId, tx as unknown as Executor));
  });
}

async function hasPublishedSections(scoped: ScopedClient): Promise<boolean> {
  // `queryWhere` adds the community and `deleted_at IS NULL` itself.
  return (await scoped.queryWhere(siteBlocks, eq(siteBlocks.isDraft, false))).length > 0;
}

/**
 * Each section with its slot: the first hero in slot 1, every other section in
 * 2, 3, … in order.
 */
function slotted<T extends { blockType: string }>(sections: readonly T[]): Array<[number, T]> {
  let next = FIRST_CONTENT_SLOT;
  let heroPlaced = false;
  return sections.map((s): [number, T] => {
    if (s.blockType === 'hero' && !heroPlaced) {
      heroPlaced = true;
      return [HERO_SLOT, s];
    }
    const slot = next;
    next += 1;
    return [slot, s];
  });
}

/**
 * The home page as the editor shows it (each slot's draft over its published
 * row, tombstoned slots left out, in slot order), and its published rows by
 * slot.
 */
function readHomePage(rows: readonly Record<string, unknown>[]): {
  current: SiteSection[];
  published: Map<number, HomeRow>;
} {
  const published = new Map<number, HomeRow>();
  const drafts = new Map<number, HomeRow>();
  for (const row of rows as unknown as readonly HomeRow[]) {
    (row.isDraft ? drafts : published).set(row.blockOrder, row);
  }
  const current: SiteSection[] = [];
  for (const slot of [...new Set([...published.keys(), ...drafts.keys()])].sort((a, b) => a - b)) {
    const row = drafts.get(slot) ?? published.get(slot);
    if (!row || row.blockType === TOMBSTONE_BLOCK_TYPE) continue;
    // The CHECK constraint on block_type admits only known types (and the tombstone).
    current.push({ id: row.id, blockType: row.blockType as BlockType, content: row.content });
  }
  return { current, published };
}

/**
 * Every version of the community type's starter pack, archived ones included:
 * a site on a legacy layout may have received any of them, verbatim.
 */
async function starterPackVersions(tx: Tx, communityType: CommunityType): Promise<LookSection[][]> {
  const rows = await tx
    .select({ blocks: siteStarterPacks.blocks })
    .from(siteStarterPacks)
    .where(eq(siteStarterPacks.communityType, communityType));
  return rows.map(({ blocks }) =>
    (Array.isArray(blocks) ? (blocks as unknown[]) : []).flatMap((block): LookSection[] => {
      const { blockType, content } = (block ?? {}) as { blockType?: unknown; content?: unknown };
      return typeof blockType === 'string' ? [{ blockType: blockType as BlockType, content }] : [];
    }),
  );
}

/**
 * Stage `sections` as the home page's next published state, the way the
 * editor's writers stage a change: clear the page's drafts, then put a draft
 * wherever a slot's published row differs (compared as the editor's change list
 * compares, so content stored with defaults filled in is not a change), and a
 * tombstone on every published slot left empty. Publishing that leaves exactly
 * `sections`; no live row is touched.
 */
async function writeHomeDrafts(
  scoped: ScopedClient,
  communityId: number,
  pageId: number,
  published: ReadonlyMap<number, HomeRow>,
  sections: readonly SiteSection[],
): Promise<void> {
  // First, so no insert below meets a live draft in the (page, slot, is_draft)
  // unique index.
  await scoped.softDelete(
    siteBlocks,
    and(eq(siteBlocks.pageId, pageId), eq(siteBlocks.isDraft, true), isNull(siteBlocks.deletedAt)),
  );

  const target = new Map(slotted(sections));
  for (const [slot, section] of target) {
    const live = published.get(slot);
    if (
      live &&
      fingerprint({ slot, blockType: live.blockType, content: live.content }) ===
        fingerprint({ slot, blockType: section.blockType, content: section.content })
    ) {
      continue;
    }
    await scoped.insert(siteBlocks, draftRow(communityId, pageId, slot, section.blockType, section.content));
  }

  const emptied = [...published.keys()].filter((slot) => !target.has(slot)).sort((a, b) => a - b);
  for (const slot of emptied) {
    await scoped.insert(siteBlocks, draftRow(communityId, pageId, slot, TOMBSTONE_BLOCK_TYPE, {}));
  }
}

function draftRow(communityId: number, pageId: number, blockOrder: number, blockType: string, content: unknown) {
  return {
    communityId,
    pageId,
    blockType,
    blockOrder,
    isDraft: true,
    publishedAt: null,
    content: content as Record<string, unknown>,
  };
}
