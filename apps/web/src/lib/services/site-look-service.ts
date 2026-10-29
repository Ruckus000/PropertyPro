/**
 * Looks, applied to a community's website (website builder, Phase 2B).
 *
 * - `applyLookAtCreation`: a new community goes live with its suggested look
 *   (D6). The look's layout, colour set, colours and fonts are written live, and
 *   its sections are published on a published home page.
 * - `fillDemoCommunitySite`: a prospect demo gets the same on its first entry.
 * - `draftLookSwitch`: the manager picks a look (D9). It is saved as a DRAFT in
 *   the editor's own draft layer, in one transaction: the home page's sections
 *   as draft rows and tombstones, and the look as `branding.draftLook`. The
 *   editor's Publish makes it live and its Discard throws it away, both
 *   unchanged. Picking the live look again restores what is live.
 * - `withdrawDraftedLook`: the manager keeps the live look (Keep my current look): a
 *   drafted look is taken back off, on any live layout, keeping their edits.
 * - `loadLookSwitchInput`: what a switch is planned from, read without writing.
 *   The switch and the look previews share it, so they cannot plan from
 *   different inputs.
 *
 * What a switch does to the home page is `planLookSwitch` in
 * `@/lib/site-looks/looks` (D5); this file only reads what it needs and writes
 * what it returns.
 *
 * AUTHZ: callers authorize. `applyLookAtCreation` runs for a community the
 * caller has just created, or a demo it is provisioning, before anyone is a
 * member of it (the same footing as `applyStarterPackToCommunity`).
 * `fillDemoCommunitySite` is called by the demo entry routes after the demo
 * instance is validated, and writes only to a community that is a demo. The
 * caller of `draftLookSwitch` or `withdrawDraftedLook` has verified a manager
 * role in the community and the `hasSiteEditor` plan feature (the website
 * routes' gate).
 * `loadLookSwitchInput` reads one community's site and the platform's starter
 * packs, and writes nothing.
 */
import { captureException } from '@sentry/nextjs';
import {
  communities,
  createScopedClient,
  logAuditEvent,
  siteBlocks,
  sitePages,
  siteStarterPacks,
} from '@propertypro/db';
import { and, eq, isNull, sql } from '@propertypro/db/filters';
// AUTHZ: opens the transaction that holds the community row lock, and reads the platform-level site_starter_packs catalog (no community_id). Tenant rows are written through createScopedClient(communityId, tx) or logAuditEvent(..., tx); the community's own row (communities, the root tenant table) is written on tx by its primary key only: site_published_at at creation, and branding.draftLook on a switch (site-design-service's writeDraftDesign / withdrawDraftDesign). Callers authorize as the docblock says.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import {
  SITE_LOOK_FIELDS,
  TOMBSTONE_BLOCK_TYPE,
  effectiveLook,
  fingerprint,
  type BlockType,
  type CommunityBranding,
  type CommunityType,
} from '@propertypro/shared';
import { updateBrandingForCommunity } from '@/lib/api/branding';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { resolveDesign, withdrawDraftDesign, writeDraftDesign } from '@/lib/services/site-design-service';
import { ensureHomePage } from '@/lib/services/site-pages-service';
import {
  assignSlots,
  getLook,
  lookIdForLayout,
  planLookSwitchWithCounts,
  planReturnToLive,
  suggestedLookFor,
  type LookDefinition,
  type LookId,
  type LookSection,
  type LookSwitchCounts,
  type LiveSection,
  type PlanLookSwitchInput,
  type SiteSection,
} from '@/lib/site-looks/looks';

type UnscopedDb = ReturnType<typeof createUnscopedClient>;
/** The drizzle transaction handle, the same alias site-pages-service uses. */
type Tx = Parameters<Parameters<UnscopedDb['transaction']>[0]>[0];
/** A handle `createScopedClient` and `logAuditEvent` both accept: the pool's, or a transaction's. */
type Executor = NonNullable<Parameters<typeof createScopedClient>[1]>;
type ScopedClient = ReturnType<typeof createScopedClient>;

/** The look fields a switch drafts: all of them but custom colours, which only the manager sets. */
const SWITCHED_LOOK_FIELDS = SITE_LOOK_FIELDS.filter((field) => field !== 'customCssOverrides');

/** A home-page row, as the switch reads it. */
interface HomeRow {
  id: number;
  blockType: string;
  blockOrder: number;
  content: unknown;
  isDraft: boolean;
}

/**
 * What a switch of the home page is planned from (D5), as `loadLookSwitchInput`
 * reads it. Plan with `planLookSwitch({ ...input, incoming })`.
 */
export interface LookSwitchInput extends Omit<PlanLookSwitchInput, 'incoming'> {
  /** The home page; null when the community has none yet, and so no sections. */
  homePageId: number | null;
  /** The home page's published rows by slot: what a staged draft is compared with. */
  published: ReadonlyMap<number, { blockType: string; content: unknown }>;
  /** The layout being left: the drafted one when there is one, else the live one. */
  outgoingLayoutId: string | null;
  /** The published home-page rows in slot order, whatever the live layout is. */
  liveRows: readonly LiveSection[];
  /** Whether a different layout is drafted over the live one (a look, or a layout that is not one). */
  layoutDrafted: boolean;
}

/** What `applyLookAtCreation` can be asked to do differently. */
export interface ApplyLookOptions {
  /**
   * Leave the colours and fonts the community already wears alone: the look
   * supplies its layout and its colour set's name, but not the colour set's
   * colours and fonts. For a prospect demo, which is created with the
   * prospect's own brand (the admin demo form requires all five fields) and
   * shows it on its website, dashboard and mobile preview alike; a new look
   * must not repaint a sales demo.
   */
  keepBrand?: boolean;
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
 * The branding is resolved the way a design save resolves it (`resolveDesign`)
 * before anything is written, so a missing colour set fails cleanly: a site
 * without its look's colours and fonts is not the look.
 *
 * Pass `keepBrand` for a community that already wears its own colours and fonts
 * (a prospect demo, `fillDemoCommunitySite`): see `ApplyLookOptions`.
 */
export async function applyLookAtCreation(
  communityId: number,
  communityType: CommunityType,
  options: ApplyLookOptions = {},
): Promise<{ applied: boolean; lookId: LookId }> {
  const look = requireLook(suggestedLookFor(communityType));
  const lookId = look.id;
  // Unlocked fast path: a provisioning retry, or a community that has a site.
  if (await hasPublishedSections(createScopedClient(communityId))) return { applied: false, lookId };

  const design = await resolveDesign({ layoutId: look.layoutId, themePresetSlug: look.presetSlug });
  await updateBrandingForCommunity(
    communityId,
    options.keepBrand ? { layoutId: design.layoutId, themePresetSlug: design.themePresetSlug } : design,
  );

  const applied = await withCommunityLock(communityId, async (tx, scoped) => {
    // Again under the lock: a racing call may have published the look since.
    if (await hasPublishedSections(scoped)) return false;

    const now = new Date();
    // Published with the sections' own stamp: anon RLS hides a draft page while
    // its published sections would still be served.
    const homePageId = await ensureHomePage(communityId, tx, { publishedAt: now });
    // A draft home page can already exist (the editor was opened first), and
    // `ensureHomePage` never flips an existing draft live.
    await scoped.update(
      sitePages,
      { isDraft: false, publishedAt: now },
      and(eq(sitePages.id, homePageId), eq(sitePages.isDraft, true)),
    );

    for (const [slot, lookSection] of assignSlots(look.sections, [])) {
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
    // `publishCommunitySite` stamps (the urgent-notice gate reads it), the same
    // way: on the root tenant table's own row, by its primary key.
    await tx
      .update(communities)
      .set({ sitePublishedAt: now })
      .where(and(eq(communities.id, communityId), isNull(communities.sitePublishedAt)));
    return true;
  });

  return { applied, lookId };
}

/**
 * A prospect demo's website, on entry: the suggested look for its type, the
 * same as a new community's (D6), kept in the prospect's own colours and fonts
 * (`keepBrand`). Demo communities are built by `seedCommunity` (the admin app's
 * demo creation and the local demo seed), which, unlike `createCommunityForPm`,
 * gives them no site at all: a prospect opening the website editor found an
 * empty page.
 *
 * The admin app cannot import this service, so the web app's demo entry routes
 * call it instead, which also fills demos created before this existed. A no-op
 * for a community that is not a demo, or that has had any section.
 *
 * A community that has ever had a section row (a draft, or one removed: removal
 * soft-deletes) is left alone, so a prospect who empties the site keeps it
 * empty.
 *
 * ponytail: runs on every demo entry (two small reads once filled), and the
 * removed rows it relies on are purged after 30 days (`cleanupSoftDeletedSiteBlocks`),
 * about a demo's lifetime. Moving this into `seedCommunity` (it needs
 * `ensureHomePage` in packages/db) ends both. Trigger: a demo lives past the
 * 30-day purge, so the look would re-apply to an emptied site.
 *
 * Best-effort, like `seedNewCommunitySite`: a failure is logged and reported
 * (Sentry tag `site_seed: demo_look`) and never blocks the entry. It is
 * reported because a systematic cause, such as the colour sets not being
 * applied yet (migration 0097), would otherwise leave every demo silently empty.
 */
export async function fillDemoCommunitySite(communityId: number): Promise<void> {
  try {
    const scoped = createScopedClient(communityId);
    const [community] = (await scoped.selectFrom(
      communities,
      { communityType: communities.communityType, isDemo: communities.isDemo },
      eq(communities.id, communityId),
    )) as unknown as Array<{ communityType: CommunityType; isDemo: boolean }>;
    if (!community?.isDemo) return;
    // Removed rows included: they are the point here.
    if ((await scoped.queryIncludingDeleted(siteBlocks)).length > 0) return;
    await applyLookAtCreation(communityId, community.communityType, { keepBrand: true });
  } catch (err) {
    console.error('fillDemoCommunitySite failed', { communityId, err });
    captureException(err, { tags: { site_seed: 'demo_look' }, extra: { communityId } });
  }
}

/**
 * Save a switch to `lookId` as a draft (D9): the home page as `planLookSwitch`
 * leaves it, and the look's layout, colour set, colours and fonts as
 * `branding.draftLook`, in one transaction under the community row lock.
 * Nothing live changes until the editor's Publish, and its Discard throws the
 * switch away. Other pages are not touched.
 *
 * Planned from `loadLookSwitchInput`, the same inputs a look preview plans
 * from. The sections are written the way the editor's own writers stage a
 * change (`writeHomeDrafts`), so publishing them leaves exactly the plan.
 *
 * What is written follows the plan's kind:
 * - `switch`: the planned sections, and the look as the draft look.
 * - `already-drafted` (the look is drafted already): nothing at all.
 *   "Publish this look" runs the switch after the card's own, and whatever the
 *   manager changed in between, on the page or in the drafted colours and
 *   fonts, stays as they left it.
 * - `live-look` (the live look, nothing else drafted): nothing at all.
 * - `back-to-live` (the live look, another layout drafted): the sections
 *   return to the live page row for row, keeping the manager's edits, and the
 *   drafted look is withdrawn, so no design change is pending. With nothing
 *   edited in between, no draft is left at all.
 *
 * The look is resolved before the transaction (`resolveDesign`: the design
 * save's own validation, and the colour set's colours and fonts), so a missing
 * colour set fails before anything is written, and saved or withdrawn inside it
 * (with its audit row), so the sections can never wait under the wrong look.
 */
export async function draftLookSwitch(
  communityId: number,
  lookId: LookId,
  opts: { actorUserId: string },
): Promise<LookSwitchCounts> {
  const incoming = requireLook(lookId);
  const design = await resolveDesign({ layoutId: incoming.layoutId, themePresetSlug: incoming.presetSlug });

  return withCommunityLock(communityId, async (tx, scoped) => {
    const input = await loadLookSwitchInput(communityId, tx);
    const { sections, kind, ...counts } = planLookSwitchWithCounts({ ...input, incoming });
    const executor = tx as unknown as Executor;

    if (kind === 'switch' || kind === 'back-to-live') {
      const homePageId = await ensureHomePage(communityId, tx);
      await writeHomeDrafts(scoped, communityId, homePageId, input.published, sections);
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
            kind,
            fromLayoutId: input.outgoingLayoutId,
            pageId: homePageId,
            ...counts,
          },
        },
        executor,
      );
    }

    if (kind === 'switch') {
      await writeDraftDesign(communityId, design, { actorUserId: opts.actorUserId, executor });
    } else if (kind === 'back-to-live') {
      await withdrawDraftDesign(communityId, SWITCHED_LOOK_FIELDS, { actorUserId: opts.actorUserId, executor });
    }
    return counts;
  });
}

/**
 * Everything a switch of the home page is planned from, read and never
 * written. `draftLookSwitch` plans from it and so must the look previews, so the
 * draft and the preview of a look cannot be planned from different inputs:
 *
 * - `current`: the home page as the editor shows it (each slot's draft over its
 *   published row, tombstoned slots left out), in slot order, each section with
 *   its row id and slot;
 * - `outgoingDefaults`: the defaults those sections could have come from. That
 *   is the look being left (the drafted look when there is one, else the live
 *   one) or, on a legacy layout, every version of the community type's starter
 *   pack, archived ones included, read only then;
 * - `draftedLookId`: the look already drafted, so that switching to it again
 *   changes nothing;
 * - `live`: the live look, the published home page in its live order (each row
 *   with its id and slot, which the way back matches the page's drafts to), and
 *   whether another layout is drafted over it, so that picking the live look
 *   again restores what is live (null on a legacy live layout).
 *
 * `planLookSwitch` applies both rules. Pass `tx` to read inside a transaction;
 * left out, each read runs on its own. Throws NotFoundError when the community
 * does not exist.
 */
export async function loadLookSwitchInput(communityId: number, tx?: Tx): Promise<LookSwitchInput> {
  const scoped = createScopedClient(communityId, tx as unknown as Executor | undefined);
  const [community] = (await scoped.query(communities)) as Array<{
    communityType?: CommunityType;
    branding?: unknown;
  }>;
  if (!community?.communityType) throw new NotFoundError('Community not found');

  const [homePage] = await scoped.queryWhere(sitePages, eq(sitePages.isHome, true));
  const homePageId = typeof homePage?.['id'] === 'number' ? homePage['id'] : null;
  const { current, published } = readHomePage(
    homePageId === null ? [] : await scoped.queryWhere(siteBlocks, eq(siteBlocks.pageId, homePageId)),
  );

  const branding = (community.branding ?? {}) as CommunityBranding;
  const liveLayoutId = branding.layoutId ?? null;
  const outgoingLayoutId = effectiveLook(branding, { includeDraft: true }).layoutId ?? null;
  const outgoingLookId = lookIdForLayout(outgoingLayoutId);
  const outgoingDefaults = outgoingLookId
    ? [requireLook(outgoingLookId).sections]
    : await starterPackVersions(community.communityType, tx);
  const liveLookId = lookIdForLayout(liveLayoutId);
  const liveRows: LiveSection[] = [...published.entries()]
    .sort(([a], [b]) => a - b)
    .map(([slot, row]) => ({ id: row.id, slot, blockType: row.blockType as BlockType, content: row.content }));
  const layoutDrafted = outgoingLayoutId !== liveLayoutId;

  return {
    homePageId,
    current,
    published,
    outgoingDefaults,
    outgoingLayoutId,
    liveRows,
    layoutDrafted,
    draftedLookId: lookIdForLayout(branding.draftLook?.layoutId),
    live: liveLookId ? { lookId: liveLookId, sections: liveRows, otherLayoutDrafted: layoutDrafted } : null,
  };
}

/**
 * Take a drafted look back off the site, keeping the live one ("Keep my current look"
 * in the look picker): the home page returns to its live rows, keeping every
 * edit the manager made since (`planReturnToLive`, the same rule as picking the
 * live look's card), and the drafted look's layout, colour set, colours and
 * fonts are withdrawn. In one transaction under the community row lock.
 *
 * Unlike picking the live card, it needs no live look, so it also works on a
 * site whose live layout is a legacy one, which no card can return to. With no
 * other layout drafted it writes nothing, so drafted colours alone (the Design
 * panel's) are left as they are. Returns whether anything was withdrawn.
 */
export async function withdrawDraftedLook(
  communityId: number,
  opts: { actorUserId: string },
): Promise<{ withdrawn: boolean }> {
  return withCommunityLock(communityId, async (tx, scoped) => {
    const input = await loadLookSwitchInput(communityId, tx);
    if (!input.layoutDrafted) return { withdrawn: false };
    const executor = tx as unknown as Executor;
    const { sections, kind, ...counts } = planReturnToLive(input.current, input.outgoingDefaults, input.liveRows);

    const homePageId = await ensureHomePage(communityId, tx);
    await writeHomeDrafts(scoped, communityId, homePageId, input.published, sections);
    await logAuditEvent(
      {
        userId: opts.actorUserId,
        communityId,
        action: 'update',
        resourceType: 'community_site',
        resourceId: String(communityId),
        metadata: {
          lookSwitch: true,
          withdrawn: true,
          kind,
          fromLayoutId: input.outgoingLayoutId,
          pageId: homePageId,
          ...counts,
        },
      },
      executor,
    );
    await withdrawDraftDesign(communityId, SWITCHED_LOOK_FIELDS, { actorUserId: opts.actorUserId, executor });
    return { withdrawn: true };
  });
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
 * The unscoped client, called in this one place: it opens the lock's
 * transaction, and reads the starter-pack catalog when no transaction is open.
 */
function unscopedDb(): UnscopedDb {
  return createUnscopedClient();
}

/**
 * Runs `work` in one transaction holding the community row lock, the lock every
 * site writer takes first (publish, the editor's writers, `ensureHomePage`'s
 * callers), with a client scoped to the community on that transaction.
 * Statements inside run on `tx` only, so none waits on the pool for a second
 * connection while this one is held.
 */
async function withCommunityLock<T>(
  communityId: number,
  work: (tx: Tx, scoped: ScopedClient) => Promise<T>,
): Promise<T> {
  return unscopedDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM communities WHERE id = ${communityId} FOR UPDATE`);
    return work(tx, createScopedClient(communityId, tx as unknown as Executor));
  });
}

async function hasPublishedSections(scoped: ScopedClient): Promise<boolean> {
  // `queryWhere` adds the community and `deleted_at IS NULL` itself.
  return (await scoped.queryWhere(siteBlocks, eq(siteBlocks.isDraft, false))).length > 0;
}

/**
 * The home page as the editor shows it (each slot's draft over its published
 * row, tombstoned slots left out, in slot order, with ids and slots), and its
 * published rows by slot.
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
    current.push({ id: row.id, slot, blockType: row.blockType as BlockType, content: row.content });
  }
  return { current, published };
}

/**
 * Every version of the community type's starter pack, archived ones included:
 * a site on a legacy layout may have received any of them, verbatim.
 */
async function starterPackVersions(communityType: CommunityType, tx?: Tx): Promise<LookSection[][]> {
  const db: Pick<UnscopedDb, 'select'> = tx ?? unscopedDb();
  const rows = await db
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
 * `sections`; no live row is touched. The slots are the published ones where
 * they can be (`assignSlots`), so a page planned back to what is live stages
 * nothing at all.
 */
async function writeHomeDrafts(
  scoped: ScopedClient,
  communityId: number,
  pageId: number,
  published: ReadonlyMap<number, { blockType: string; content: unknown }>,
  sections: readonly SiteSection[],
): Promise<void> {
  // First, so no insert below meets a live draft in the (page, slot, is_draft)
  // unique index.
  await scoped.softDelete(
    siteBlocks,
    and(eq(siteBlocks.pageId, pageId), eq(siteBlocks.isDraft, true), isNull(siteBlocks.deletedAt)),
  );

  const target = new Map(assignSlots(sections, published.keys()));
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
