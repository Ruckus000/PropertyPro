/**
 * Site Blocks Service
 *
 * Mutation entry points for community site blocks. Authenticated writes
 * only — tenant-scoped via createScopedClient. Audit-logged.
 *
 * PR #1b shipped `upsertPublishedHero`. PR #2 factored the publish primitive
 * into `upsertPublishedBlock(...)` so text and image blocks could use the
 * same machinery (sequential soft-delete + insert + external audit log).
 *
 * PR #8a moves both `upsertPublishedBlock` and a new `publishCommunitySite`
 * onto `db.transaction()` so the soft-delete + insert + audit-log triple
 * is atomic. The atomic-publish path (spec §2.7) acquires a row-level
 * lock on the community row (`SELECT ... FOR UPDATE`) and checks an
 * optimistic-concurrency token (`expectedPublishedAt`) before promoting
 * drafts to published.
 *
 * AUTHZ: This file is allowlisted in scripts/verify-scoped-db-access.ts
 * for `createUnscopedClient` import. Callers MUST verify management-tier
 * (property_manager / root_manager) membership and the `hasSiteEditor` plan
 * feature at the route layer.
 */
import {
  communities,
  complianceAuditLog,
  createScopedClient,
  paginate,
  siteBlocks,
  sitePageRedirects,
  sitePages,
  sitePublishSnapshots,
  type AuditAction,
  type SitePublishSnapshotPayload,
  type SitePublishSnapshotPayloadV2,
} from '@propertypro/db';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from '@propertypro/db/filters';
// AUTHZ: PR #8a atomic site-blocks publish — caller (route layer) verifies management-tier (property_manager / root_manager) + hasSiteEditor.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import {
  TOMBSTONE_BLOCK_TYPE,
  pageIssues,
  publishBlocked,
  siteIssues,
  type HeroBlockContent,
  type SiteSnapshot,
} from '@propertypro/shared';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { isReservedPublicSlug } from '@/lib/middleware/public-host-routes';
import { ensureHomePage } from '@/lib/services/site-pages-service';

/**
 * Content blocks occupy block_order 2..99; the hero is reserved at order 1
 * (spec §2.7). Reorder operates only on content blocks, so reads start here.
 */
const MIN_CONTENT_BLOCK_ORDER = 2;
/** Slot 1 is the hero: pinned, not reorderable, not removable. */
const HERO_BLOCK_ORDER = 1;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Narrowed transaction shape for inline audit-log writes. Mirrors the
 * elections-service pattern (apps/web/src/lib/services/elections-service.ts).
 * Inlining the audit insert into the same tx keeps the publish atomic — a
 * crash between mutations and the audit row would otherwise leave a
 * mutation without provenance.
 */
type AuditInsertExecutor = {
  insert(table: typeof complianceAuditLog): {
    values(payload: Record<string, unknown>): Promise<unknown>;
  };
};

type UnscopedDb = ReturnType<typeof createUnscopedClient>;
/** The drizzle transaction handle — see the same alias in site-pages-service.ts. */
type Tx = Parameters<Parameters<UnscopedDb['transaction']>[0]>[0];

/**
 * Resolves the page a write targets (Phase 11b multi-page).
 *
 * Three jobs, and the third is the load-bearing one:
 *
 *   1. An absent `pageId` means the home page. 11b-1 ships before any client can
 *      send one, so every legacy request has to keep landing somewhere sane.
 *   2. A supplied `pageId` is verified to belong to THIS community before it is
 *      used. The composite FK `(community_id, page_id)` would refuse a foreign
 *      page anyway, but as an opaque 500 rather than a 404 — and relying on a
 *      constraint for authorization means the error message is the only thing
 *      standing between a PM and a confusing failure.
 *   3. `ensureHomePage` runs either way, which ADOPTS any of the community's
 *      page-less blocks. That is what lets the rest of this file treat
 *      `site_blocks.page_id` as non-null even though the column is still
 *      nullable until 11c, and it repairs rows written by the pre-11b deploy
 *      during the rollout window.
 */
async function resolvePageId(
  communityId: number,
  requestedPageId: number | undefined,
  tx: Tx,
): Promise<number> {
  const homePageId = await ensureHomePage(communityId, tx);
  if (requestedPageId === undefined) return homePageId;
  if (requestedPageId === homePageId) return homePageId;

  const rows = await tx
    .select({ id: sitePages.id })
    .from(sitePages)
    .where(
      and(
        eq(sitePages.communityId, communityId),
        eq(sitePages.id, requestedPageId),
        isNull(sitePages.deletedAt),
      ),
    )
    .limit(1);
  if (!rows[0]) {
    throw new NotFoundError('Page not found for this community');
  }
  return rows[0].id;
}

async function insertAuditEventInTransaction(
  tx: AuditInsertExecutor,
  params: {
    userId: string | null;
    action: AuditAction;
    resourceType: string;
    resourceId: string;
    communityId: number;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(complianceAuditLog).values({
    userId: params.userId,
    communityId: params.communityId,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    metadata: params.metadata ?? null,
  });
}

// ---------------------------------------------------------------------------
// Publish history (website editor v3, Phase 6)
// ---------------------------------------------------------------------------

/**
 * How many publishes per community keep their `snapshot` payload. Older log
 * rows survive with `snapshot = NULL` — see `pruneSitePublishSnapshots`.
 */
export const SITE_PUBLISH_SNAPSHOT_KEEP = 20;

/**
 * Narrowed transaction shape for the history-row insert. Same pattern (and
 * same reason) as `AuditInsertExecutor`: the helper needs one table's
 * `insert(...).values(...)`, not the whole drizzle transaction surface.
 */
type SnapshotInsertExecutor = {
  insert(table: typeof sitePublishSnapshots): {
    values(payload: Record<string, unknown>): Promise<unknown>;
  };
};

/** `announcements` → `Announcements`, `faq` → `Faq`. Label text, not an id. */
function humanizeBlockType(blockType: string): string {
  return blockType
    .split(/[_-]/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Human labels for what a publish carried, derived from the same pre-publish
 * row set the validation step already read (no extra query).
 *
 * These are persisted on the history row precisely so the list endpoint can
 * render without touching `snapshot` — which it must never return, and which
 * retention nulls out anyway.
 */
export interface PageSlot {
  pageId: number;
  blockOrder: number;
}

/** Stable key for a (page, slot) pair — see the publish transaction's winner map. */
function pageSlotKey(pageId: number, blockOrder: number): string {
  return `${pageId}:${blockOrder}`;
}

function dedupePageSlots(pairs: readonly PageSlot[]): PageSlot[] {
  const seen = new Map<string, PageSlot>();
  for (const pair of pairs) {
    seen.set(pageSlotKey(pair.pageId, pair.blockOrder), pair);
  }
  return [...seen.values()];
}

export function summarizePublishChanges(
  liveRows: readonly {
    pageId: number;
    blockOrder: number;
    blockType: string;
    isDraft: boolean;
  }[],
  draftSlots: readonly PageSlot[],
  /**
   * Page names by id, so a multi-page publish says WHICH page changed. Optional:
   * a single-page community (every community before 11b-3 ships) reads better
   * without the suffix, and the labels are persisted, so adding "on Home" to
   * every historical row would be noise.
   */
  pageNames?: ReadonlyMap<number, string>,
): string[] {
  return [...draftSlots]
    .sort((a, b) => a.pageId - b.pageId || a.blockOrder - b.blockOrder)
    .map(({ pageId, blockOrder }) => {
      const at = (r: { pageId: number; blockOrder: number }) =>
        r.pageId === pageId && r.blockOrder === blockOrder;
      const draft = liveRows.find((r) => r.isDraft && at(r));
      const published = liveRows.find((r) => !r.isDraft && at(r));
      const suffix = pageNames && pageNames.size > 1 ? ` on ${pageNames.get(pageId) ?? 'a page'}` : '';
      if (draft?.blockType === TOMBSTONE_BLOCK_TYPE) {
        return `Removed ${humanizeBlockType(published?.blockType ?? 'section')}${suffix}`;
      }
      if (published) {
        return `Updated ${humanizeBlockType(draft?.blockType ?? published.blockType)}${suffix}`;
      }
      return `Added ${humanizeBlockType(draft?.blockType ?? 'section')}${suffix}`;
    });
}

/**
 * Reads either stored payload version into the v2 shape.
 *
 * Production holds v1 rows written before Phase 11b, and they must stay
 * restorable — a publish history that silently stops working for anything older
 * than a deploy is not a history. A v1 payload carries no page dimension, so
 * every block is attributed to the home page, which is correct by construction:
 * v1 predates the existence of a second page. Its `pages` manifest is
 * reconstructed as a single home entry so downstream code has one shape.
 *
 * Defensive about the payload's own contents (`blocks` missing, a block with no
 * `pageId`) because this is stored JSON, not a validated request: rows written by
 * an older deploy, a hand-edit, or a future rollback all pass through here.
 */
export function readSnapshotPayload(
  payload: SitePublishSnapshotPayload,
  homePageId: number,
): {
  version: 1 | 2;
  pages: SitePublishSnapshotPayloadV2['pages'];
  blocks: SitePublishSnapshotPayloadV2['blocks'];
} {
  if (payload.version === 2) {
    return {
      version: 2,
      pages: payload.pages ?? [],
      // A v2 block missing its pageId is malformed; home is the only safe guess
      // and matches how v1 is read.
      blocks: (payload.blocks ?? []).map((b) => ({ ...b, pageId: b.pageId ?? homePageId })),
    };
  }
  const blocks = payload.blocks ?? [];
  return {
    version: 1,
    pages: [
      {
        pageId: homePageId,
        name: 'Home',
        slug: '',
        inNav: true,
        sortOrder: 0,
        isHome: true,
      },
    ],
    blocks: blocks.map((b) => ({ ...b, pageId: homePageId })),
  };
}

/**
 * Human labels for the PAGE-level changes a publish carried (Phase 11b).
 *
 * Separate from `summarizePublishChanges` because pages are not slots: adding or
 * removing a page is not an event at any `block_order`, so it cannot be derived
 * from the draft-slot set. Without this, a publish whose only change was a page
 * would persist a history row reading `changeCount: 0` with no labels — a
 * permanent record of a publish that visibly changed nothing, which on a
 * statutory records site is the one thing the log exists to avoid.
 */
export function summarizePageChanges(
  addedPages: readonly { name: string }[],
  removedPages: readonly { name: string }[],
): string[] {
  return [
    ...addedPages.map((p) => `Added page ${p.name}`),
    ...removedPages.map((p) => `Removed page ${p.name}`),
  ];
}

export interface CaptureSnapshotInput {
  communityId: number;
  actorUserId: string;
  /**
   * The SAME `published_at` the publish stamped across every promoted row —
   * passed in, never regenerated. A second `new Date()` here would produce a
   * history entry whose timestamp does not correspond to any site state, and
   * `published_at` doubles as the optimistic-concurrency token.
   */
  publishedAt: Date;
  /** The post-publish published block set. Tombstones are already excluded. */
  blocks: SitePublishSnapshotPayloadV2['blocks'];
  /**
   * Every page as it existed at publish time — the manifest that makes a revert
   * able to RECREATE a page that has since been deleted. See
   * `SitePublishSnapshotPage`.
   */
  pages: SitePublishSnapshotPayloadV2['pages'];
  /** Human labels for the history list — see `summarizePublishChanges`. */
  changeLabels: string[];
}

/**
 * Writes one publish-history row.
 *
 * MUST be called inside `publishCommunitySite`'s transaction, under the same
 * `SELECT ... FOR UPDATE` community lock and AFTER the promote step. Both
 * halves matter: inside the transaction so a rolled-back publish leaves no
 * history claiming something shipped, and after the promote so the row records
 * what was actually published rather than what was merely intended.
 *
 * AUTHZ: no gate of its own — it is an internal step of an already-authorized
 * publish.
 */
export async function captureSnapshot(
  tx: SnapshotInsertExecutor,
  { communityId, actorUserId, publishedAt, blocks, pages, changeLabels }: CaptureSnapshotInput,
): Promise<void> {
  const payload: SitePublishSnapshotPayloadV2 = { version: 2, pages, blocks };
  await tx.insert(sitePublishSnapshots).values({
    communityId,
    publishedAt,
    actorUserId,
    changeCount: changeLabels.length,
    changeLabels,
    snapshot: payload,
  });
}

// ---------------------------------------------------------------------------
// Per-block upsert (PR #2 surface, now transactional)
// ---------------------------------------------------------------------------

export interface UpsertPublishedBlockInput {
  communityId: number;
  actorUserId: string;
  blockType: string;
  blockOrder: number;
  content: unknown;
  /**
   * PR #8e — when true, writes a draft row (`is_draft=true, published_at=null`)
   * instead of writing straight to published. The publish workflow
   * (`publishCommunitySite`) promotes drafts to published atomically.
   * Defaults to false to preserve PR #1b/#2 callers; the PM editor's
   * PATCH routes now pass true.
   */
  isDraft?: boolean;
  /**
   * Which page the block belongs to (Phase 11b multi-page). OPTIONAL, and
   * defaults to the community's home page — 11b-1 ships before any UI can send
   * one, so the currently-live client must keep working unchanged. It becomes
   * mandatory in practice only when 11c makes the column NOT NULL.
   */
  pageId?: number;
}

export async function upsertPublishedBlock({
  communityId,
  actorUserId,
  blockType,
  blockOrder,
  content,
  isDraft = false,
  pageId: requestedPageId,
}: UpsertPublishedBlockInput): Promise<void> {
  const db = createUnscopedClient();

  await db.transaction(async (tx) => {
    const pageId = await resolvePageId(communityId, requestedPageId, tx);
    // Scoped client bound to the transaction — preserves tenant isolation
    // while keeping the soft-delete + insert + audit-log triple atomic.
    const scoped = createScopedClient(communityId, tx as unknown as Parameters<typeof createScopedClient>[1]);

    // Step 1: Soft-delete any existing row of the SAME draft-state at this
    // blockOrder. The predicate intentionally does NOT include blockType.
    // The partial unique index
    // `site_blocks_community_order_draft_partial` is keyed on
    // (community_id, block_order, is_draft) post-migration 0008
    // WHERE deleted_at IS NULL — block_type is NOT part of the uniqueness
    // constraint. Filtering soft-delete on block_type would leave a row of
    // a different type at the same order, and the subsequent insert would
    // collide on the partial unique index → opaque 500.
    //
    // We match on `is_draft = isDraft` (not always false): writing a draft
    // replaces an existing draft at the same slot but leaves any published
    // row in place (so the public site keeps serving the last-published
    // version until publish runs). Symmetrically, writing published
    // replaces the published row only.
    //
    // Phase 11b: also pinned to the page. Without `page_id` in the predicate,
    // editing one page's slot would soft-delete a different page's draft at the
    // same order.
    await scoped.softDelete(
      siteBlocks,
      and(
        eq(siteBlocks.pageId, pageId),
        eq(siteBlocks.blockOrder, blockOrder),
        eq(siteBlocks.isDraft, isDraft),
        isNull(siteBlocks.deletedAt),
      ),
    );

    // Step 2: Insert the new row. Drafts carry no publishedAt (NULL); the
    // promote-drafts step in publishCommunitySite sets publishedAt = now()
    // when they become published.
    await scoped.insert(siteBlocks, {
      communityId,
      pageId,
      blockType,
      blockOrder,
      isDraft,
      publishedAt: isDraft ? null : new Date(),
      content: content as Record<string, unknown>,
    });

    // Step 3: Audit row inside the same tx — atomic with the mutation.
    await insertAuditEventInTransaction(tx as unknown as AuditInsertExecutor, {
      userId: actorUserId,
      communityId,
      action: 'update',
      resourceType: 'site_block',
      resourceId: blockType,
      metadata: { blockType, blockOrder, isDraft, pageId },
    });
  });
}

// ---------------------------------------------------------------------------
// Atomic community-wide publish (PR #8a — spec §2.7)
// ---------------------------------------------------------------------------

export interface PublishCommunitySiteInput {
  communityId: number;
  actorUserId: string;
  /**
   * Optimistic-concurrency token. The caller passes the `publishedAt` it
   * loaded with the editor state. If a concurrent publish has advanced
   * the server-side value since then, the publish fails with `ConflictError`
   * (HTTP 409) and the editor reloads. Pass `null` to skip the check
   * (use only for tests or first-ever publishes).
   */
  expectedPublishedAt: Date | null;
}

export type PublishCommunitySiteResult =
  | {
      published: true;
      publishedAt: Date;
      promotedCount: number;
      retiredCount: number;
    }
  | {
      published: false;
      reason: 'nothing-to-publish';
    };

/**
 * Atomic community-wide publish per spec §2.7.
 *
 * Transaction:
 *   1. `SELECT ... FOR UPDATE` on the community row — serializes concurrent
 *      publish attempts for the same community.
 *   2. Read the current max `published_at` across published, non-deleted
 *      site_blocks. If `expectedPublishedAt` is supplied and doesn't match,
 *      throw `ConflictError` so the editor reloads.
 *   3. Read the set of `block_order`s that have a live draft. If empty, roll
 *      back and return `{ published: false, reason: 'nothing-to-publish' }`
 *      (no mutations run). Callers surface this as a 200 "no changes".
 *   4. Soft-delete the currently-published rows ONLY at those block_orders —
 *      the slots being republished. Published rows at slots WITHOUT a draft
 *      (e.g. the hero, or any block the PM didn't edit/move this session) are
 *      kept intact. This makes the published site equal the merged
 *      draft-wins editor view (spec §2.7), rather than wiping every published
 *      block whenever a single draft exists.
 *   4b. Soft-delete tombstone drafts (staged deletions from removeSiteBlock,
 *      slice 8f). Step 4 already retired the published rows they shadow;
 *      dropping the tombstones before step 5 means they are never promoted —
 *      the slot simply ends up empty.
 *   5. Promote every draft row (is_draft=true, deleted_at IS NULL) to
 *      published (is_draft=false, published_at=now()).
 *   6. Audit row (action='update', resourceType='community_site') inside
 *      the same tx so the mutation has provenance.
 *
 * Order matters: the soft-delete (step 4) moves the superseded published rows
 * out of the partial unique index BEFORE the draft-promotion (step 5) flips
 * the draft rows to `is_draft=false` at the same block_orders. Every promoted
 * draft sits at a block_order whose published row was just retired, so no two
 * rows ever share `(community_id, block_order, is_draft=false)` mid-tx.
 */
export async function publishCommunitySite({
  communityId,
  actorUserId,
  expectedPublishedAt,
}: PublishCommunitySiteInput): Promise<PublishCommunitySiteResult> {
  const db = createUnscopedClient();

  return db.transaction(async (tx) => {
    // Step 1: row-level lock on the community row. Concurrent publish
    // attempts for the same community queue here. communities is the root
    // tenant table; no scoping required.
    await tx.execute(
      sql`SELECT id FROM communities WHERE id = ${communityId} FOR UPDATE`,
    );

    // Phase 11b: resolve (and if necessary create) the home page BEFORE any read
    // below. `ensureHomePage` also adopts any page-less blocks, which is what
    // lets every subsequent step treat `page_id` as non-null while the column is
    // still nullable — including rows the pre-11b deploy wrote during rollout.
    const homePageId = await ensureHomePage(communityId, tx);

    // Step 2: optimistic-concurrency check. The `expectedPublishedAt`
    // token captures the editor's snapshot of state; a mismatch means
    // someone else published in between.
    if (expectedPublishedAt !== null) {
      // Newest published row by publishedAt. Sufficient as a concurrency
      // token — every publishCommunitySite call promotes drafts with a
      // single fresh publishedAt, so all rows from one publish share the
      // same timestamp. The first publishedAt the caller saw advances on
      // every successful publish.
      const newest = await tx
        .select({ publishedAt: siteBlocks.publishedAt })
        .from(siteBlocks)
        .where(
          and(
            eq(siteBlocks.communityId, communityId),
            eq(siteBlocks.isDraft, false),
            isNull(siteBlocks.deletedAt),
          ),
        )
        .orderBy(desc(siteBlocks.publishedAt))
        .limit(1);
      const currentMax = newest[0]?.publishedAt ?? null;
      // Compare by epoch ms — Date instances and the postgres timestamp
      // round-trip can produce equal-but-non-identical references.
      const currentMs = currentMax instanceof Date ? currentMax.getTime() : null;
      const expectedMs = expectedPublishedAt.getTime();
      if (currentMs !== expectedMs) {
        throw new ConflictError(
          'Another editor published changes while you were working. Reload the page and try again.',
        );
      }
    }

    // Step 3: which (page, block_order) slots have a live draft? Publish
    // promotes those drafts and retires ONLY the published rows they supersede.
    //
    // The pair, not the bare order, is the key. While the pre-11a 3-column index
    // survives, an order belongs to exactly one page anyway — but keying on the
    // order alone would become a cross-page data-loss bug the moment 11c permits
    // per-page numbering, and the retire predicate below is where it would bite.
    // Pairing it now makes 11c a pure index drop with no change to this file.
    const draftRows = await tx
      .select({ pageId: siteBlocks.pageId, blockOrder: siteBlocks.blockOrder })
      .from(siteBlocks)
      .where(
        and(
          eq(siteBlocks.communityId, communityId),
          eq(siteBlocks.isDraft, true),
          isNull(siteBlocks.deletedAt),
        ),
      );
    const draftPairs = dedupePageSlots(
      draftRows.map((r) => ({ pageId: r.pageId ?? homePageId, blockOrder: r.blockOrder })),
    );

    // Pages carry pending changes of their own: one created but never published,
    // and one staged for removal. Either is something to publish even when no
    // block draft exists, so both count here — otherwise "add a page, publish"
    // would report "no changes" and quietly do nothing.
    //
    // The HOME page is excluded from the draft arm, and that exclusion is
    // load-bearing. `ensureHomePage` creates it lazily as a draft for any
    // community that has never published, so counting it would make EVERY such
    // community's publish claim it had work to do — promoting an empty home page
    // and writing a history row for a publish that changed nothing. It is an
    // artefact of lazy creation, not a PM action. It still gets promoted by the
    // page promote below whenever a publish proceeds for a real reason, which is
    // exactly when it should become live.
    const pageRows = await tx
      .select({
        id: sitePages.id,
        name: sitePages.name,
        slug: sitePages.slug,
        inNav: sitePages.inNav,
        sortOrder: sitePages.sortOrder,
        isHome: sitePages.isHome,
        isDraft: sitePages.isDraft,
        deleteStagedAt: sitePages.deleteStagedAt,
      })
      .from(sitePages)
      .where(and(eq(sitePages.communityId, communityId), isNull(sitePages.deletedAt)));
    const pendingPages = pageRows.filter(
      (p) => (p.isDraft && !p.isHome) || p.deleteStagedAt !== null,
    );

    // Nothing pending at all → nothing to publish. Roll back BEFORE any mutation
    // so the prior published rows are never touched. Drizzle's transaction
    // wrapper undoes the (no-op) tx and the outer .catch converts the sentinel.
    if (draftPairs.length === 0 && pendingPages.length === 0) {
      throw new NothingToPublishRollback();
    }

    // Step 3b: validate what this publish would make PUBLIC, and refuse if it
    // is invalid.
    //
    // This is not a duplicate of the editor's review sheet — it is the actual
    // gate. The sheet runs the same shared validator, but a validator that
    // lives only in the client is a suggestion: the publish route is reachable
    // by any authorized PM with an HTTP client, and the legacy editor writes
    // through the same endpoints. So the check runs here, inside the
    // transaction and before any mutation, and a failure rolls the whole thing
    // back rather than half-publishing.
    //
    // The snapshot is the POST-publish state, not the draft layer: draft wins
    // per slot, tombstoned slots disappear, and published rows at slots with no
    // draft survive. That is exactly what steps 4-6 below produce, so this
    // validates the outcome rather than the intent.
    const liveRowsRaw = await tx
      .select({
        pageId: siteBlocks.pageId,
        blockOrder: siteBlocks.blockOrder,
        blockType: siteBlocks.blockType,
        content: siteBlocks.content,
        isDraft: siteBlocks.isDraft,
      })
      .from(siteBlocks)
      .where(and(eq(siteBlocks.communityId, communityId), isNull(siteBlocks.deletedAt)));
    // `page_id` is nullable until 11c, but `ensureHomePage` above adopted every
    // page-less row, so a NULL here would mean a row inserted mid-transaction by
    // something else. Coalescing to home keeps the rest of this function
    // non-nullable rather than sprinkling `?? homePageId` through it.
    const liveRows = liveRowsRaw.map((r) => ({ ...r, pageId: r.pageId ?? homePageId }));

    // Keyed on the PAGE and the order — one winner per slot per page.
    const winnerByPageSlot = new Map<string, (typeof liveRows)[number]>();
    for (const row of liveRows) {
      const key = pageSlotKey(row.pageId, row.blockOrder);
      const existing = winnerByPageSlot.get(key);
      if (!existing || (row.isDraft && !existing.isDraft)) {
        winnerByPageSlot.set(key, row);
      }
    }
    const winners = [...winnerByPageSlot.values()].filter(
      (r) => r.blockType !== TOMBSTONE_BLOCK_TYPE,
    );

    // Validate ONE SNAPSHOT PER PAGE. A single community-wide snapshot would
    // report every page's second section as a duplicate slot the moment slots
    // repeat across pages, and would attribute an error to no page in
    // particular — the review sheet groups by page, so the issues have to be
    // attributable.
    //
    // Only the home page carries a hero: slot 1 is the hero by convention and
    // while the 3-column index survives exactly one row per community can hold
    // it. So non-home pages validate with `heroExpected: false`, which
    // suppresses the "no welcome section" warning rather than weakening it for
    // home.
    // Step 3b-pages: validate the PAGE SET before the block content. Cross-page
    // rules (two pages at one address, a reserved slug, no home) are the ones a
    // per-page block snapshot cannot see, and a publish is the last point at
    // which the site's URL surface can still be refused.
    //
    // The service already rejects each of these at create/rename time, so
    // reaching an error here means a state that arrived some other way — a raw
    // SQL write, a restored snapshot, or a protected route added to the app after
    // a page claimed its slug. That last one is real and is exactly why the check
    // runs on every publish rather than only on write.
    const redirectRows = await tx
      .select({ fromSlug: sitePageRedirects.fromSlug, pageId: sitePageRedirects.pageId })
      .from(sitePageRedirects)
      .where(
        and(
          eq(sitePageRedirects.communityId, communityId),
          isNull(sitePageRedirects.deletedAt),
        ),
      );

    const pageValidationIssues = pageIssues({
      pages: pageRows.map((p) => ({
        pageId: String(p.id),
        name: p.name,
        slug: p.slug,
        isHome: p.isHome,
        isDraft: p.isDraft,
        deleteStaged: p.deleteStagedAt !== null,
      })),
      retiredSlugs: redirectRows.map((r) => ({
        slug: r.fromSlug,
        pageId: String(r.pageId),
      })),
      isReserved: isReservedPublicSlug,
    });
    if (publishBlocked(pageValidationIssues)) {
      throw new ValidationError('This site cannot be published yet.', {
        fields: pageValidationIssues
          .filter((i) => i.severity === 'error')
          .map((i) => ({ field: i.field, message: i.message })),
      });
    }

    const pagesForValidation =
      pageRows.length > 0
        ? pageRows
        : [{ id: homePageId, isHome: true, deleteStagedAt: null } as (typeof pageRows)[number]];
    for (const page of pagesForValidation) {
      // A page being removed by this publish is about to stop existing; holding
      // the publish on its content would block the removal of a broken page.
      if (page.deleteStagedAt !== null) continue;

      const pageWinners = winners.filter((r) => r.pageId === page.id);
      const heroRow = page.isHome
        ? pageWinners.find((r) => r.blockOrder === HERO_BLOCK_ORDER)
        : undefined;
      const snapshot: SiteSnapshot = {
        pageId: String(page.id),
        hero: heroRow
          ? { slot: heroRow.blockOrder, blockType: heroRow.blockType, content: heroRow.content }
          : null,
        sections: pageWinners
          .filter((r) => !(page.isHome && r.blockOrder === HERO_BLOCK_ORDER))
          .map((r) => ({ slot: r.blockOrder, blockType: r.blockType, content: r.content })),
      };

      const issues = siteIssues(snapshot, { heroExpected: page.isHome });
      if (publishBlocked(issues)) {
        // Only errors are surfaced; warnings are the sheet's business, not a
        // reason to refuse a publish. `field` is page-qualified so a failure on
        // one of several pages says which.
        throw new ValidationError('This site cannot be published yet.', {
          fields: issues
            .filter((i) => i.severity === 'error')
            .map((i) => ({ field: `page:${page.id}.${i.field}`, message: i.message })),
        });
      }
    }

    // Step 4: soft-delete the published rows AT the slots being republished
    // only — published blocks at slots without a draft survive untouched.
    // Returns the count of rows affected so we can surface it in the audit
    // row and the result object.
    //
    // Matched on the (page, order) PAIR, not `inArray(blockOrder, …)`. With a
    // bare order list, a draft at slot 3 on one page would retire the published
    // slot-3 row of every other page — deleting live content the PM never
    // touched. An OR of ANDs is the honest predicate; the pair count is bounded
    // by the community's slot budget, so it stays small.
    let retiredCount = 0;
    if (draftPairs.length > 0) {
      const retiredResult = await tx
        .update(siteBlocks)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(siteBlocks.communityId, communityId),
            eq(siteBlocks.isDraft, false),
            isNull(siteBlocks.deletedAt),
            or(
              ...draftPairs.map((pair) =>
                and(
                  eq(siteBlocks.pageId, pair.pageId),
                  eq(siteBlocks.blockOrder, pair.blockOrder),
                ),
              ),
            ),
          ),
        )
        .returning({ id: siteBlocks.id });
      retiredCount = retiredResult.length;
    }

    // Step 4b: retire tombstone drafts (staged deletions from
    // removeSiteBlock). Their published rows were just soft-deleted in step 4
    // (tombstone orders are part of draftOrders); soft-deleting the
    // tombstones themselves BEFORE step 5 ensures they are never promoted to
    // published — the slot simply ends up empty, which is the point.
    await tx
      .update(siteBlocks)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(siteBlocks.communityId, communityId),
          eq(siteBlocks.isDraft, true),
          eq(siteBlocks.blockType, TOMBSTONE_BLOCK_TYPE),
          isNull(siteBlocks.deletedAt),
        ),
      );

    // Step 5: promote drafts. Capture the new publishedAt up front so the
    // returned timestamp matches what landed in the rows.
    const publishedAt = new Date();
    const promotedResult = await tx
      .update(siteBlocks)
      .set({ isDraft: false, publishedAt })
      .where(
        and(
          eq(siteBlocks.communityId, communityId),
          eq(siteBlocks.isDraft, true),
          isNull(siteBlocks.deletedAt),
        ),
      )
      .returning({ id: siteBlocks.id });
    const promotedCount = promotedResult.length;

    // Step 5a-pages (Phase 11b): apply the page-level pending changes.
    //
    // Removals FIRST, then promotions. A page staged for removal is by
    // definition already published, so the two sets are disjoint — but doing
    // removals first means a slug freed by a removal is available to a page
    // being published into it within the same transaction, rather than colliding
    // on `site_pages_community_slug_partial`.
    const removedPageIds: number[] = [];
    for (const page of pageRows) {
      if (page.deleteStagedAt === null) continue;
      await tx
        .update(siteBlocks)
        .set({ deletedAt: new Date() })
        .where(and(eq(siteBlocks.communityId, communityId), eq(siteBlocks.pageId, page.id)));
      // The page's slug history goes with it. Leaving those rows live would
      // forward visitors to a page that no longer exists (a 404 with extra
      // steps), and would keep every slug the page ever held permanently
      // unclaimable by any future page.
      await tx
        .update(sitePageRedirects)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(sitePageRedirects.communityId, communityId),
            eq(sitePageRedirects.pageId, page.id),
          ),
        );
      await tx
        .update(sitePages)
        .set({ deletedAt: new Date() })
        .where(and(eq(sitePages.communityId, communityId), eq(sitePages.id, page.id)));
      removedPageIds.push(page.id);
    }

    const promotedPageResult = await tx
      .update(sitePages)
      .set({ isDraft: false, publishedAt })
      .where(
        and(
          eq(sitePages.communityId, communityId),
          eq(sitePages.isDraft, true),
          isNull(sitePages.deletedAt),
        ),
      )
      .returning({ id: sitePages.id });
    const promotedPageCount = promotedPageResult.length;

    // Step 5c: reconcile the stamp with what actually landed.
    //
    // A REMOVAL-ONLY publish promotes zero rows: the only pending draft was a
    // tombstone, and step 4b already retired it. `publishedAt` above was
    // generated before the UPDATE, so in that case it denotes a moment no
    // version of the site ever corresponded to — nothing carries it. Handing
    // that value to the history row makes the log answer "what did this page
    // show in March" with a timestamp the site never had, which is the one
    // question a statutory records site keeps this table to answer.
    //
    // So when nothing was promoted, fall back to the stamp the SURVIVING
    // published rows carry. That is the site's real current version.
    //
    // This does not lose "when did the removal happen" — `site_publish_snapshots`
    // has its own `created_at DEFAULT now()`, which is the publish event's clock.
    // `published_at` is the site-version stamp; the two are different questions
    // and the table already has a column for each.
    //
    // Known limitation, deliberately not changed here: a removal-only publish
    // therefore does not advance MAX(published_at), so a concurrent editor
    // holding the older token can still publish. That is benign — their publish
    // promotes their own drafts and cannot resurrect the removed section — and
    // making removals advance the token would mean rewriting `published_at` on
    // rows whose content did not change, destroying its per-row meaning.
    let effectivePublishedAt = publishedAt;
    if (promotedCount === 0) {
      const survivors = await tx
        .select({ publishedAt: siteBlocks.publishedAt })
        .from(siteBlocks)
        .where(
          and(
            eq(siteBlocks.communityId, communityId),
            eq(siteBlocks.isDraft, false),
            isNull(siteBlocks.deletedAt),
            isNotNull(siteBlocks.publishedAt),
          ),
        )
        .orderBy(desc(siteBlocks.publishedAt))
        .limit(1);
      // No survivor at all (every published row retired) is not reachable today
      // — the hero cannot be removed — but falling back to the fresh stamp
      // keeps the NOT NULL column satisfied rather than throwing.
      const survivorStamp = survivors[0]?.publishedAt;
      if (survivorStamp) effectivePublishedAt = survivorStamp;
    }

    // Step 5b (Phase 6): record the publish in the history log — same tx, same
    // community lock, AFTER the promote, so the row describes what actually
    // shipped and a rollback takes the history entry with it.
    //
    // `winners` is already the post-publish published set (draft-wins per slot,
    // tombstoned slots dropped), which is exactly what steps 4-5 just made
    // live, so no re-read is needed.
    const removedPages = new Set(removedPageIds);
    const survivingPages = pageRows.filter((p) => !removedPages.has(p.id));
    const pageNames = new Map(survivingPages.map((p) => [p.id, p.name]));

    await captureSnapshot(tx as unknown as SnapshotInsertExecutor, {
      communityId,
      actorUserId,
      publishedAt: effectivePublishedAt,
      // Sorted by page then slot so the payload is deterministic — two publishes
      // of the same site produce byte-identical JSON, which is what makes a
      // history diff meaningful.
      blocks: [...winners]
        .filter((w) => !removedPages.has(w.pageId))
        .sort((a, b) => a.pageId - b.pageId || a.blockOrder - b.blockOrder)
        .map((w) => ({
          pageId: w.pageId,
          blockOrder: w.blockOrder,
          blockType: w.blockType,
          content: w.content,
        })),
      pages: survivingPages
        .sort((a, b) => Number(b.isHome) - Number(a.isHome) || a.sortOrder - b.sortOrder)
        .map((p) => ({
          pageId: p.id,
          name: p.name,
          slug: p.slug,
          inNav: p.inNav,
          sortOrder: p.sortOrder,
          isHome: p.isHome,
        })),
      changeLabels: [
        ...summarizePublishChanges(liveRows, draftPairs, pageNames),
        // Page-level changes are not slot events, so they cannot come out of the
        // draft-slot set — see `summarizePageChanges`. `promotedPages` is read
        // from the pre-mutation `pageRows`, because by now the promote has
        // already flipped `is_draft`.
        ...summarizePageChanges(
          pageRows.filter((p) => p.isDraft && !p.isHome && !removedPages.has(p.id)),
          pageRows.filter((p) => removedPages.has(p.id)),
        ),
      ],
    });

    // Step 5d: stamp `communities.site_published_at`.
    //
    // This column had NO application writer. The only one was the admin
    // site-builder publish route, deleted in eab4f36e when the DnD builder was
    // replaced — since then every publish has gone through this function, which
    // stamped `site_blocks.published_at` and left the community column NULL
    // forever.
    //
    // It is not decorative. `hasPublishedSite` in the v3 editor reads it, and
    // so does the urgent notice's "publish your website first" gate
    // (urgent-notice-service.ts) — which therefore refused every community
    // published through the current editor, i.e. all of them. The admin app's
    // "Published" label reads it too.
    //
    // Stamped inside the same transaction and from `effectivePublishedAt`, so
    // it can never disagree with the site-version stamp the rows carry or
    // survive a rolled-back publish. Existing rows are repaired by migration
    // 0043; this stops the drift, that repairs it.
    await tx
      .update(communities)
      .set({ sitePublishedAt: effectivePublishedAt })
      .where(eq(communities.id, communityId));

    // Step 6: audit row inside the same tx so the publish has atomic
    // provenance.
    await insertAuditEventInTransaction(tx as unknown as AuditInsertExecutor, {
      userId: actorUserId,
      communityId,
      action: 'update',
      resourceType: 'community_site',
      resourceId: String(communityId),
      metadata: {
        retiredCount,
        promotedCount,
        promotedPageCount,
        removedPageIds,
        publishedAt: effectivePublishedAt.toISOString(),
      },
    });

    // Mark Drizzle that we want to keep the work — the explicit return
    // here means the implicit COMMIT runs.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    // `effectivePublishedAt`, not the pre-promote stamp: the caller may echo
    // this back as its optimistic-concurrency token, and it must therefore be a
    // value MAX(published_at) will actually agree with.
    return {
      published: true as const,
      publishedAt: effectivePublishedAt,
      promotedCount,
      retiredCount,
    };
  })
    .catch((err: unknown) => {
      if (err instanceof NothingToPublishRollback) {
        return { published: false as const, reason: 'nothing-to-publish' as const };
      }
      throw err;
    });
}

/**
 * Sentinel thrown inside the publishCommunitySite transaction when there
 * are no drafts to promote. Drizzle rolls back, and the outer `.catch`
 * converts the sentinel to a `{ published: false }` result. We use a
 * sentinel rather than a flag because the rollback is part of the
 * semantics — the soft-delete step shouldn't land if no drafts exist.
 */
class NothingToPublishRollback extends Error {
  constructor() {
    super('publishCommunitySite: no drafts to promote — rolling back');
  }
}

// ---------------------------------------------------------------------------
// Per-block reorder (spec §9 PR #8 — ↑/↓ move controls)
// ---------------------------------------------------------------------------

export interface ReorderSiteBlockInput {
  communityId: number;
  actorUserId: string;
  /**
   * The id of the WINNING (merged draft-wins) content-block row to move — the
   * `id` the editor's GET surfaced for that slot. Must be a content block
   * (block_order >= 2); the hero is not reorderable.
   */
  blockId: number;
  /**
   * Relative move by one position (the ↑/↓ controls and the keyboard grip).
   * Exactly one of `direction` / `toOrder` must be supplied.
   */
  direction?: 'up' | 'down';
  /**
   * Absolute move (drag-and-drop): the `block_order` slot the moved block
   * should end up occupying. Everything between its old and new position
   * shifts by one to close the gap — this is a rotation, not a swap, which is
   * why a drag cannot be expressed as a sequence of `direction` calls without
   * N round-trips and a partial-failure window.
   */
  toOrder?: number;
  /**
   * Which page's list is being reordered. Defaults to home — see
   * `resolvePageId`. Reordering is strictly WITHIN a page: the merged list this
   * function rotates must contain only that page's sections, or a drag on one
   * page renumbers another.
   */
  pageId?: number;
}

export interface ReorderSiteBlockResult {
  movedBlockId: number;
  /** The moved block's order before the move. */
  fromOrder: number;
  /** The moved block's order after the move. */
  toOrder: number;
  /** True when the requested move was a no-op (dropped where it started). */
  unchanged: boolean;
}

interface MergedContentBlock {
  id: number;
  blockType: string;
  blockOrder: number;
  content: unknown;
  isDraft: boolean;
}

/**
 * Moves a content block to a new position, writing the result to the DRAFT
 * layer. Accepts either a relative `direction` (one position) or an absolute
 * `toOrder` (a drag-and-drop drop target).
 *
 * Both are the same operation: rotate the merged list between the source and
 * target positions, then re-stamp the existing slot values onto the new
 * sequence. A one-position move touches two slots and is therefore exactly the
 * swap this function used to perform; a drag touches the whole span it crosses.
 * Slot values are reused rather than recomputed, so a sparse ordering (2, 3, 7)
 * stays sparse and no unrelated block's `block_order` changes.
 *
 * Mirrors the per-block edit model (upsertPublishedBlock with isDraft=true):
 * the swap is expressed as draft rows so the public site keeps serving the
 * last-published order until the PM publishes. A published-only block being
 * moved gets a draft COPY at its new order (content taken from the merged
 * draft-wins view), which `publishCommunitySite` later promotes.
 *
 * Partial-unique-index safety: the two affected slots' existing draft rows are
 * soft-deleted first (removing them from
 * `site_blocks_community_order_draft_partial`), then two fresh draft rows are
 * inserted at the swapped orders. Published rows (is_draft=false) live under a
 * different index key, so they never collide with the inserts — they remain in
 * place, shadowed, until publish. No order-mutating UPDATE runs, so there is no
 * mid-transaction uniqueness collision (no park-then-renumber needed).
 *
 * AUTHZ: caller (route layer) verifies management-tier (property_manager / root_manager) membership + hasSiteEditor.
 */
export async function reorderSiteBlock({
  communityId,
  actorUserId,
  blockId,
  direction,
  toOrder: requestedOrder,
  pageId: requestedPageId,
}: ReorderSiteBlockInput): Promise<ReorderSiteBlockResult> {
  if ((direction === undefined) === (requestedOrder === undefined)) {
    throw new ValidationError(
      'Specify exactly one of direction or toOrder when moving a section.',
    );
  }

  const db = createUnscopedClient();

  return db.transaction(async (tx) => {
    // Serialize concurrent reorders/publishes for this community (matches
    // publishCommunitySite's lock) so the read-merge-write below is atomic.
    await tx.execute(
      sql`SELECT id FROM communities WHERE id = ${communityId} FOR UPDATE`,
    );

    const pageId = await resolvePageId(communityId, requestedPageId, tx);

    const scoped = createScopedClient(
      communityId,
      tx as unknown as Parameters<typeof createScopedClient>[1],
    );

    // Read THIS PAGE's non-deleted content blocks (order >= 2; the hero at
    // order 1 is excluded). Build the same merged draft-wins view the editor
    // sees so the swap operates on the rows the PM is actually looking at.
    //
    // The `page_id` filter is not optional: without it the merged list is every
    // page's sections interleaved by `block_order`, and a drag on one page
    // rewrites slots belonging to another.
    const rows = await tx
      .select({
        id: siteBlocks.id,
        blockType: siteBlocks.blockType,
        blockOrder: siteBlocks.blockOrder,
        content: siteBlocks.content,
        isDraft: siteBlocks.isDraft,
      })
      .from(siteBlocks)
      .where(
        and(
          eq(siteBlocks.communityId, communityId),
          eq(siteBlocks.pageId, pageId),
          isNull(siteBlocks.deletedAt),
          gte(siteBlocks.blockOrder, MIN_CONTENT_BLOCK_ORDER),
        ),
      )
      .orderBy(asc(siteBlocks.blockOrder));

    const byOrder = new Map<number, MergedContentBlock>();
    for (const row of rows) {
      const existing = byOrder.get(row.blockOrder);
      if (!existing || (row.isDraft && !existing.isDraft)) {
        byOrder.set(row.blockOrder, row);
      }
    }
    // Tombstone drafts (staged deletions) shadow their published row in the
    // merge; the editor doesn't show them, so they are not reorderable and
    // must not count as neighbors.
    const merged = [...byOrder.values()]
      .filter((b) => b.blockType !== TOMBSTONE_BLOCK_TYPE)
      .sort((a, b) => a.blockOrder - b.blockOrder);

    const index = merged.findIndex((b) => b.id === blockId);
    if (index === -1) {
      throw new NotFoundError('Content section not found for this community');
    }

    let targetIndex: number;
    if (direction !== undefined) {
      targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= merged.length) {
        throw new ValidationError(
          `Cannot move this section ${direction}: it is already ${direction === 'up' ? 'first' : 'last'}.`,
        );
      }
    } else {
      targetIndex = merged.findIndex((b) => b.blockOrder === requestedOrder);
      if (targetIndex === -1) {
        // The slot is empty, holds the hero, or holds a tombstone. Rejecting
        // rather than clamping keeps a stale client from silently moving a
        // section somewhere the PM did not drop it.
        throw new ValidationError(
          'That position is no longer a content section. Reload the page and try again.',
        );
      }
    }

    // `index` was found above and `targetIndex` is bounds-checked, so both
    // elements are present.
    const moving = merged[index]!;
    const fromOrder = moving.blockOrder;
    const destOrder = merged[targetIndex]!.blockOrder;

    // Dropping a section where it already sits is a no-op, not an error — the
    // PM did nothing wrong, and writing a draft row here would manufacture a
    // pending change out of a cancelled drag.
    if (targetIndex === index) {
      return { movedBlockId: blockId, fromOrder, toOrder: destOrder, unchanged: true };
    }

    // Rotate the span between source and target, then re-stamp the span's
    // existing slot values onto the new sequence.
    const rotated = [...merged];
    rotated.splice(index, 1);
    rotated.splice(targetIndex, 0, moving);

    const low = Math.min(index, targetIndex);
    const high = Math.max(index, targetIndex);
    const affectedSlots = merged.slice(low, high + 1).map((b) => b.blockOrder);

    // Step 1: clear existing draft rows at every affected slot so the inserts
    // below can't collide on the partial unique index.
    await scoped.softDelete(
      siteBlocks,
      and(
        eq(siteBlocks.pageId, pageId),
        inArray(siteBlocks.blockOrder, affectedSlots),
        eq(siteBlocks.isDraft, true),
        isNull(siteBlocks.deletedAt),
      ),
    );

    // Step 2: write a draft row per affected slot. Each carries the winning
    // row's content + type, so a published-only block becomes a draft copy at
    // its new order.
    for (let position = low; position <= high; position += 1) {
      const occupant = rotated[position]!;
      await scoped.insert(siteBlocks, {
        communityId,
        pageId,
        blockType: occupant.blockType,
        blockOrder: affectedSlots[position - low]!,
        isDraft: true,
        publishedAt: null,
        content: occupant.content as Record<string, unknown>,
      });
    }

    // Step 3: audit row inside the same tx.
    await insertAuditEventInTransaction(tx as unknown as AuditInsertExecutor, {
      userId: actorUserId,
      communityId,
      action: 'update',
      resourceType: 'site_block',
      resourceId: String(blockId),
      metadata: {
        reorder: true,
        ...(direction !== undefined ? { direction } : { absolute: true }),
        pageId,
        fromOrder,
        toOrder: destOrder,
        affectedSlots,
      },
    });

    return { movedBlockId: blockId, fromOrder, toOrder: destOrder, unchanged: false };
  });
}

// ---------------------------------------------------------------------------
// Block deletion + discard drafts (slice 8f)
// ---------------------------------------------------------------------------

export interface RemoveSiteBlockInput {
  communityId: number;
  actorUserId: string;
  /**
   * The slot to remove. Content blocks only (block_order >= 2) — the hero at
   * order 1 is required by every layout and cannot be deleted.
   */
  blockOrder: number;
  /** Which page the slot belongs to. Defaults to home — see `resolvePageId`. */
  pageId?: number;
}

export interface RemoveSiteBlockResult {
  /**
   * true  — the slot has a published row; a tombstone draft was staged and
   *         the live site keeps the section until the next publish.
   * false — the slot was draft-only; the draft was discarded immediately.
   */
  staged: boolean;
}

/**
 * Removes the content section at `blockOrder`, expressed in the same draft
 * model as edits and reorders:
 *
 *   - Draft-only slot (never published): soft-delete the draft. The section
 *     disappears immediately; nothing is staged.
 *   - Published slot: soft-delete any draft at the order, then insert a
 *     `tombstone` draft. The live site keeps serving the published row until
 *     `publishCommunitySite` retires it (step 4) and drops the tombstone
 *     (step 4b). Re-adding a section at the order (upsertPublishedBlock)
 *     replaces the tombstone — re-add cancels the staged removal, and
 *     `discardSiteDrafts` undoes it wholesale.
 *
 * Why a tombstone and not an immediate both-layer delete: after a reorder,
 * the published row at a slot can be a *different logical section* than the
 * merged draft-wins row the PM is looking at — deleting both layers by order
 * would silently drop the wrong section from the live site.
 *
 * AUTHZ: caller (route layer) verifies management-tier (property_manager / root_manager) membership + hasSiteEditor.
 */
export async function removeSiteBlock({
  communityId,
  actorUserId,
  blockOrder,
  pageId: requestedPageId,
}: RemoveSiteBlockInput): Promise<RemoveSiteBlockResult> {
  if (blockOrder < MIN_CONTENT_BLOCK_ORDER) {
    throw new ValidationError('The welcome (hero) section cannot be removed.');
  }

  const db = createUnscopedClient();

  return db.transaction(async (tx) => {
    // Serialize with publish/reorder for this community (same lock) so the
    // read-decide-write below can't interleave with a promotion.
    await tx.execute(
      sql`SELECT id FROM communities WHERE id = ${communityId} FOR UPDATE`,
    );

    const pageId = await resolvePageId(communityId, requestedPageId, tx);

    const scoped = createScopedClient(
      communityId,
      tx as unknown as Parameters<typeof createScopedClient>[1],
    );

    // Page-scoped: without `page_id` here, deleting one page's slot 3 would read
    // (and below, soft-delete) another page's slot-3 draft.
    const rows = await tx
      .select({
        id: siteBlocks.id,
        blockType: siteBlocks.blockType,
        isDraft: siteBlocks.isDraft,
      })
      .from(siteBlocks)
      .where(
        and(
          eq(siteBlocks.communityId, communityId),
          eq(siteBlocks.pageId, pageId),
          eq(siteBlocks.blockOrder, blockOrder),
          isNull(siteBlocks.deletedAt),
        ),
      );

    const hasPublished = rows.some((r) => !r.isDraft);
    const visibleDraft = rows.find(
      (r) => r.isDraft && r.blockType !== TOMBSTONE_BLOCK_TYPE,
    );

    // Nothing the PM can see at this slot (empty, or already tombstoned with
    // no published row — which publish would clean up anyway).
    if (!hasPublished && !visibleDraft) {
      throw new NotFoundError('Content section not found for this community');
    }

    // Clear any draft at the slot (edited draft or stale tombstone). For a
    // draft-only slot this IS the removal; for a published slot it makes room
    // for the tombstone under the partial unique index.
    await scoped.softDelete(
      siteBlocks,
      and(
        eq(siteBlocks.pageId, pageId),
        eq(siteBlocks.blockOrder, blockOrder),
        eq(siteBlocks.isDraft, true),
        isNull(siteBlocks.deletedAt),
      ),
    );

    if (hasPublished) {
      await scoped.insert(siteBlocks, {
        communityId,
        pageId,
        blockType: TOMBSTONE_BLOCK_TYPE,
        blockOrder,
        isDraft: true,
        publishedAt: null,
        content: {},
      });
    }

    await insertAuditEventInTransaction(tx as unknown as AuditInsertExecutor, {
      userId: actorUserId,
      communityId,
      action: 'delete',
      resourceType: 'site_block',
      resourceId: String(blockOrder),
      metadata: {
        blockOrder,
        pageId,
        staged: hasPublished,
        removedBlockType: visibleDraft?.blockType ?? rows.find((r) => !r.isDraft)?.blockType ?? null,
      },
    });

    return { staged: hasPublished };
  });
}

export interface DiscardSiteDraftsInput {
  communityId: number;
  actorUserId: string;
}

export interface DiscardSiteDraftsResult {
  discardedCount: number;
  /** Never-published pages dropped, plus staged page removals cancelled. */
  discardedPageCount: number;
}

/**
 * Discards every pending draft for the community — staged edits, staged
 * reorders, and staged deletions (tombstones) alike. Published rows are
 * untouched, so the editor snaps back to exactly what the live site shows.
 * Without this, a staged change could only be escaped by publishing it.
 *
 * DELIBERATELY WHOLE-SITE, not per-page (Phase 11b). This is "revert my site to
 * what the public sees", and a PM reaching for it after a bad editing session
 * wants all of it gone. A per-page discard would leave the site in a state that
 * is neither the draft nor the published one.
 *
 * Pages participate: a page created but never published IS a pending change, so
 * discard drops it, and a staged page removal is un-staged. Anything already
 * published — including a rename, which is live-immediate — is not a draft and
 * therefore survives, exactly as a published block does.
 *
 * AUTHZ: caller (route layer) verifies management-tier (property_manager / root_manager) membership + hasSiteEditor.
 */
export async function discardSiteDrafts({
  communityId,
  actorUserId,
}: DiscardSiteDraftsInput): Promise<DiscardSiteDraftsResult> {
  const db = createUnscopedClient();

  return db.transaction(async (tx) => {
    // Same community lock as publish — a discard racing a publish must see
    // either all drafts (discard wins the lock) or none (publish promoted
    // them first), never a partial set.
    await tx.execute(
      sql`SELECT id FROM communities WHERE id = ${communityId} FOR UPDATE`,
    );

    const discarded = await tx
      .update(siteBlocks)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(siteBlocks.communityId, communityId),
          eq(siteBlocks.isDraft, true),
          isNull(siteBlocks.deletedAt),
        ),
      )
      .returning({ id: siteBlocks.id });
    const discardedCount = discarded.length;

    // Pages: drop the never-published ones and cancel staged removals. The
    // page's blocks were already caught above if they were drafts; a published
    // block cannot belong to an unpublished page, so nothing published is lost.
    const droppedPages = await tx
      .update(sitePages)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(sitePages.communityId, communityId),
          eq(sitePages.isDraft, true),
          eq(sitePages.isHome, false),
          isNull(sitePages.deletedAt),
        ),
      )
      .returning({ id: sitePages.id });

    const unstagedPages = await tx
      .update(sitePages)
      .set({ deleteStagedAt: null })
      .where(
        and(
          eq(sitePages.communityId, communityId),
          isNotNull(sitePages.deleteStagedAt),
          isNull(sitePages.deletedAt),
        ),
      )
      .returning({ id: sitePages.id });

    const discardedPageCount = droppedPages.length + unstagedPages.length;

    if (discardedCount > 0 || discardedPageCount > 0) {
      await insertAuditEventInTransaction(tx as unknown as AuditInsertExecutor, {
        userId: actorUserId,
        communityId,
        action: 'delete',
        resourceType: 'community_site_drafts',
        resourceId: String(communityId),
        metadata: { discardedCount, discardedPageCount },
      });
    }

    return { discardedCount, discardedPageCount };
  });
}

// ---------------------------------------------------------------------------
// Publish-history list (website editor v3, Phase 6)
// ---------------------------------------------------------------------------

/**
 * One publish-history entry as the API exposes it.
 *
 * There is deliberately NO `snapshot` member. The payload is read here (the
 * scoped select returns every column) and converted to the single bit callers
 * need — `restorable` — so the block content of a past publish cannot reach a
 * client through this path even if a future handler spreads the row.
 */
export interface SitePublishHistoryEntry {
  id: number;
  publishedAt: Date;
  actorUserId: string | null;
  changeCount: number;
  changeLabels: string[];
  /** False once retention has cleared the payload; the log row remains. */
  restorable: boolean;
}

export interface PaginateSitePublishHistoryInput {
  communityId: number;
  cursor?: string | undefined;
  pageSize?: number | undefined;
}

export interface PaginatedSitePublishHistory {
  data: SitePublishHistoryEntry[];
  pagination: { nextCursor: string | null; hasMore: boolean; pageSize: number };
}

/**
 * A page of the community's publish log, newest first.
 *
 * Ordering is `id desc`, which for an append-only log is equivalent to
 * `published_at desc` — the id-keyed `paginate()` helper is therefore the right
 * tool rather than a hard-tier sort-preserving cursor (see ADR-003).
 *
 * AUTHZ: caller (route layer) verifies management-tier membership +
 * hasSiteEditor + admin-read entitlement. Tenant isolation is the scoped
 * client's — the query cannot see another community's log.
 */
export async function paginateSitePublishHistory({
  communityId,
  cursor,
  pageSize,
}: PaginateSitePublishHistoryInput): Promise<PaginatedSitePublishHistory> {
  const scoped = createScopedClient(communityId);
  const result = await paginate<{
    id: number;
    publishedAt: Date;
    actorUserId: string | null;
    changeCount: number | null;
    changeLabels: string[] | null;
    snapshot: SitePublishSnapshotPayload | null;
    [key: string]: unknown;
  }>(scoped, sitePublishSnapshots, { cursor, pageSize });

  return {
    data: result.data.map((row) => ({
      id: row.id,
      publishedAt: row.publishedAt,
      actorUserId: row.actorUserId ?? null,
      changeCount: row.changeCount ?? 0,
      changeLabels: row.changeLabels ?? [],
      // The ONLY thing the stored payload contributes to the response.
      restorable: row.snapshot !== null && row.snapshot !== undefined,
    })),
    pagination: result.pagination,
  };
}

// ---------------------------------------------------------------------------
// Revert to a past publish (website editor v3, Phase 6)
// ---------------------------------------------------------------------------

export interface RevertToSnapshotInput {
  communityId: number;
  actorUserId: string;
  /**
   * The `site_publish_snapshots.id` to restore. NEVER trusted on its own — the
   * lookup is filtered by `communityId` as well, so an id belonging to another
   * association simply does not resolve.
   */
  snapshotId: number;
}

export interface RevertToSnapshotResult {
  snapshotId: number;
  /** The `published_at` of the version that was restored (not a new stamp). */
  restoredPublishedAt: Date;
  /** Draft rows written from the snapshot payload. */
  restoredCount: number;
  /** Tombstone drafts staged for sections the snapshot did not contain. */
  stagedRemovalCount: number;
  /** Pending drafts cleared to make room for the restore. */
  clearedDraftCount: number;
}

/**
 * Restores a past publish into the DRAFT layer. The PM then reviews and clicks
 * Publish to make it live again.
 *
 * WHY DRAFT AND NOT STRAIGHT TO PUBLISHED. Both are defensible; draft wins on
 * three counts. (1) It is how every other editor mutation in this file behaves
 * — edit, reorder, and remove all stage into the draft layer, so a revert that
 * bypassed it would be the one action in the editor with no review step. (2) A
 * revert is a recovery action taken under stress, frequently by someone who is
 * not certain which version they want; publishing it immediately makes a
 * mis-click a second public-site incident on top of the first, on a statutory
 * page. (3) The publish path already carries the server-side validation gate
 * (step 3b) — routing the restore through it means an old snapshot that no
 * longer satisfies the current block schemas is caught at publish rather than
 * silently re-published. The cost is one extra click; the PM keeps the undo.
 *
 * Atomic, under the same community `FOR UPDATE` lock as publish/reorder/discard,
 * so a revert racing a publish sees a settled draft layer rather than half of one.
 *
 * PARTIAL-UNIQUE-INDEX SAFETY. `site_blocks_community_order_draft_partial` is
 * keyed on `(community_id, block_order, is_draft) WHERE deleted_at IS NULL`, so
 * every live draft row is soft-deleted BEFORE any insert runs — the same
 * delete-then-insert ordering `reorderSiteBlock` and `upsertPublishedBlock`
 * depend on. Reversing it collides on the index and surfaces as an opaque 500.
 *
 * TOMBSTONES ARE NOT RESURRECTED. Tombstone entries are filtered out of the
 * snapshot payload before the restore (a tombstone is a staged deletion, not
 * content — and `captureSnapshot` never records one, so this is belt-and-braces
 * against a hand-written or legacy payload). Separately, published slots the
 * snapshot does NOT contain get a FRESH tombstone draft: reverting to a version
 * that predates a section has to stage that section's removal, or the "revert"
 * would leave it live.
 *
 * AUTHZ: caller (route layer) verifies management-tier (property_manager /
 * root_manager) membership + hasSiteEditor.
 */
export async function revertToSnapshot({
  communityId,
  actorUserId,
  snapshotId,
}: RevertToSnapshotInput): Promise<RevertToSnapshotResult> {
  const db = createUnscopedClient();

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM communities WHERE id = ${communityId} FOR UPDATE`,
    );

    const scoped = createScopedClient(
      communityId,
      tx as unknown as Parameters<typeof createScopedClient>[1],
    );

    // IDOR GUARD. `communityId` is part of the predicate, not a post-hoc
    // check on the fetched row: a snapshot belonging to community A can never
    // be loaded — let alone restored — while acting on community B. The route
    // layer's membership check establishes WHICH community; this pins the row
    // to it.
    const snapshotRows = await tx
      .select({
        id: sitePublishSnapshots.id,
        publishedAt: sitePublishSnapshots.publishedAt,
        snapshot: sitePublishSnapshots.snapshot,
      })
      .from(sitePublishSnapshots)
      .where(
        and(
          eq(sitePublishSnapshots.id, snapshotId),
          eq(sitePublishSnapshots.communityId, communityId),
          isNull(sitePublishSnapshots.deletedAt),
        ),
      )
      .limit(1);

    const snapshotRow = snapshotRows[0];
    if (!snapshotRow) {
      throw new NotFoundError('That published version was not found for this community');
    }

    // Retention nulls `snapshot` while keeping the log row, so a perfectly
    // real history entry can be un-restorable. That is a 400 with an
    // explanation, never a 500 on a null dereference.
    if (!snapshotRow.snapshot) {
      throw new ValidationError(
        'This version is too old to restore — its saved content has been cleared. The entry remains in the publish history.',
      );
    }

    const homePageId = await ensureHomePage(communityId, tx);

    // Read the payload through the version-tolerant adapter: a v1 row (written
    // before Phase 11b) has no page dimension at all, and every one of its
    // blocks is the home page's — true by construction, since v1 predates the
    // existence of a second page.
    const payload = readSnapshotPayload(snapshotRow.snapshot, homePageId);

    // Every page the snapshot names must still exist, or its blocks have nowhere
    // to go. Recreating a page from the manifest is possible, but reclaiming a
    // SLUG that now belongs to a different page would silently redirect live
    // traffic — so a revert that would have to do that is refused with something
    // the PM can read, rather than half-applied.
    const restorePageIds = [...new Set(payload.blocks.map((b) => b.pageId))];
    const livePages = await tx
      .select({ id: sitePages.id, slug: sitePages.slug })
      .from(sitePages)
      .where(and(eq(sitePages.communityId, communityId), isNull(sitePages.deletedAt)));
    const livePageIds = new Set(livePages.map((p) => p.id));
    const missingPages = restorePageIds.filter((id) => !livePageIds.has(id));
    if (missingPages.length > 0) {
      const names = missingPages
        .map((id) => payload.pages.find((p) => p.pageId === id)?.name ?? `page ${id}`)
        .join(', ');
      throw new ValidationError(
        `This version cannot be restored: it contains content for a page that has since been deleted (${names}). Recreate the page first, then restore.`,
      );
    }

    // Dedupe defensively by (page, slot) — first wins — and drop tombstones: two
    // rows at one slot would collide on the partial unique index below.
    const bySlot = new Map<string, (typeof payload.blocks)[number]>();
    for (const block of payload.blocks) {
      if (block.blockType === TOMBSTONE_BLOCK_TYPE) continue;
      const key = pageSlotKey(block.pageId, block.blockOrder);
      if (!bySlot.has(key)) bySlot.set(key, block);
    }
    const restoreBlocks = [...bySlot.values()].sort(
      (a, b) => a.pageId - b.pageId || a.blockOrder - b.blockOrder,
    );

    // Current live state: how many drafts we are about to clear, and which
    // (page, slot) pairs are published (so sections missing from the snapshot get
    // staged for removal rather than silently surviving the "revert").
    const liveRowsRaw = await tx
      .select({
        pageId: siteBlocks.pageId,
        blockOrder: siteBlocks.blockOrder,
        isDraft: siteBlocks.isDraft,
      })
      .from(siteBlocks)
      .where(and(eq(siteBlocks.communityId, communityId), isNull(siteBlocks.deletedAt)));
    const liveRows = liveRowsRaw.map((r) => ({ ...r, pageId: r.pageId ?? homePageId }));

    const clearedDraftCount = liveRows.filter((r) => r.isDraft).length;
    const restoredSlots = new Set(
      restoreBlocks.map((b) => pageSlotKey(b.pageId, b.blockOrder)),
    );
    const removalSlots = dedupePageSlots(
      liveRows.filter((r) => !r.isDraft).map((r) => ({ pageId: r.pageId, blockOrder: r.blockOrder })),
    )
      // The hero is required by every layout and cannot be removed
      // (removeSiteBlock rejects it), so it is never staged for deletion.
      .filter(
        (pair) =>
          pair.blockOrder !== HERO_BLOCK_ORDER &&
          !restoredSlots.has(pageSlotKey(pair.pageId, pair.blockOrder)),
      )
      .sort((a, b) => a.pageId - b.pageId || a.blockOrder - b.blockOrder);

    // STEP 1 — clear the whole live draft layer (edits, staged reorders, and
    // staged deletions alike). This MUST precede every insert below: it is
    // what takes the existing rows out of the partial unique index.
    await scoped.softDelete(
      siteBlocks,
      and(eq(siteBlocks.isDraft, true), isNull(siteBlocks.deletedAt)),
    );

    // STEP 2 — write the snapshot back as drafts.
    for (const block of restoreBlocks) {
      await scoped.insert(siteBlocks, {
        communityId,
        pageId: block.pageId,
        blockType: block.blockType,
        blockOrder: block.blockOrder,
        isDraft: true,
        publishedAt: null,
        content: (block.content ?? {}) as Record<string, unknown>,
      });
    }

    // STEP 3 — stage removal of published sections the snapshot predates.
    for (const pair of removalSlots) {
      await scoped.insert(siteBlocks, {
        communityId,
        pageId: pair.pageId,
        blockType: TOMBSTONE_BLOCK_TYPE,
        blockOrder: pair.blockOrder,
        isDraft: true,
        publishedAt: null,
        content: {},
      });
    }

    await insertAuditEventInTransaction(tx as unknown as AuditInsertExecutor, {
      userId: actorUserId,
      communityId,
      action: 'update',
      resourceType: 'community_site',
      resourceId: String(communityId),
      metadata: {
        revert: true,
        snapshotId,
        restoredPublishedAt: snapshotRow.publishedAt.toISOString(),
        restoredCount: restoreBlocks.length,
        stagedRemovalCount: removalSlots.length,
        clearedDraftCount,
      },
    });

    return {
      snapshotId,
      restoredPublishedAt: snapshotRow.publishedAt,
      restoredCount: restoreBlocks.length,
      stagedRemovalCount: removalSlots.length,
      clearedDraftCount,
    };
  });
}

// ---------------------------------------------------------------------------
// Publish-history retention (website editor v3, Phase 6 — decision 12)
// ---------------------------------------------------------------------------

/**
 * Nulls the `snapshot` payload on every publish-history row beyond the most
 * recent `keepPerCommunity` publishes per community, and KEEPS THE LOG ROW.
 *
 * The row is the point: on a statutory site "what did the public page show in
 * March, and who published it" stays answerable indefinitely, while the bulky
 * block payload — the only part with real storage cost — ages out. Revert is
 * therefore offered only where `snapshot IS NOT NULL`; `revertToSnapshot`
 * refuses a pruned row with a 400 rather than a null dereference, and the list
 * endpoint surfaces `restorable` so the UI can say so before the click.
 *
 * Cross-tenant by design — this is the daily-cron shape, modelled on
 * `cleanupSoftDeletedSiteBlocks`. It is exported but NOT yet wired into the
 * lifecycle cron.
 *
 * The rank-and-prune is done in two statements rather than one window-function
 * UPDATE deliberately: the read is already bounded (it only scans rows that
 * still HAVE a payload, i.e. roughly `keepPerCommunity` per community plus the
 * new arrivals since the last sweep), and keeping it in the query builder means
 * it stays inside the same tenant-column conventions as the rest of the file
 * instead of a raw-SQL CTE whose result shape varies by driver.
 *
 * AUTHZ: caller (the cron route) verifies the cron secret. Uses
 * `createUnscopedClient` (already allowlisted for this file) because the sweep
 * is intentionally cross-community.
 */
export async function pruneSitePublishSnapshots(
  keepPerCommunity: number = SITE_PUBLISH_SNAPSHOT_KEEP,
): Promise<{ pruned: number }> {
  const db = createUnscopedClient();

  const rows = await db
    .select({
      id: sitePublishSnapshots.id,
      communityId: sitePublishSnapshots.communityId,
    })
    .from(sitePublishSnapshots)
    .where(
      and(
        isNotNull(sitePublishSnapshots.snapshot),
        isNull(sitePublishSnapshots.deletedAt),
      ),
    )
    // Newest publish first; `id` breaks ties so two publishes sharing a
    // timestamp still rank deterministically.
    .orderBy(desc(sitePublishSnapshots.publishedAt), desc(sitePublishSnapshots.id));

  const seenPerCommunity = new Map<number, number>();
  const staleIds: number[] = [];
  for (const row of rows) {
    const seen = (seenPerCommunity.get(row.communityId) ?? 0) + 1;
    seenPerCommunity.set(row.communityId, seen);
    if (seen > keepPerCommunity) staleIds.push(row.id);
  }

  if (staleIds.length === 0) return { pruned: 0 };

  // UPDATE, not DELETE — the log row outlives its payload.
  const pruned = await db
    .update(sitePublishSnapshots)
    .set({ snapshot: null, updatedAt: new Date() })
    .where(inArray(sitePublishSnapshots.id, staleIds))
    .returning({ id: sitePublishSnapshots.id });

  return { pruned: pruned.length };
}

// ---------------------------------------------------------------------------
// PR #1b back-compat
// ---------------------------------------------------------------------------

export interface UpsertPublishedHeroInput {
  /** PR #8e — pass through to upsertPublishedBlock. Defaults to false. */
  isDraft?: boolean;
  communityId: number;
  actorUserId: string;
  content: HeroBlockContent;
}

// ---------------------------------------------------------------------------
// Soft-delete cleanup (PR #8d — spec §2.7)
// ---------------------------------------------------------------------------

/**
 * Hard-deletes `site_blocks` rows whose `deleted_at` is older than
 * `retentionDays`. Cross-tenant by design — runs from the daily
 * account-lifecycle cron. Returns the number of rows deleted.
 *
 * The publish transaction (publishCommunitySite) soft-deletes the
 * previously-published row set so the old content survives long enough for
 * accidental-publish recovery. Spec §2.7 sets the retention window at 30
 * days; this cleanup completes the lifecycle.
 *
 * AUTHZ: caller (the cron route) verifies the cron secret. This function
 * uses createUnscopedClient (already allowlisted for this file) because the
 * sweep is intentionally cross-community.
 */
export async function cleanupSoftDeletedSiteBlocks(
  now: Date,
  retentionDays: number = 30,
): Promise<{ deleted: number }> {
  const db = createUnscopedClient();
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  const deleted = await db
    .delete(siteBlocks)
    .where(
      and(
        isNotNull(siteBlocks.deletedAt),
        lt(siteBlocks.deletedAt, cutoff),
      ),
    )
    .returning({ id: siteBlocks.id });

  return { deleted: deleted.length };
}

/**
 * Back-compat caller (PR #1b's contract). Delegates to upsertPublishedBlock
 * with blockType='hero' and blockOrder=1.
 */
export async function upsertPublishedHero({
  communityId,
  actorUserId,
  content,
  isDraft = false,
}: UpsertPublishedHeroInput): Promise<void> {
  return upsertPublishedBlock({
    communityId,
    actorUserId,
    blockType: 'hero',
    blockOrder: 1,
    content,
    isDraft,
  });
}

