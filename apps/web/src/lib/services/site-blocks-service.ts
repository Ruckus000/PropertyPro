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
  complianceAuditLog,
  createScopedClient,
  siteBlocks,
  type AuditAction,
} from '@propertypro/db';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from '@propertypro/db/filters';
// AUTHZ: PR #8a atomic site-blocks publish — caller (route layer) verifies management-tier (property_manager / root_manager) + hasSiteEditor.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { TOMBSTONE_BLOCK_TYPE, type HeroBlockContent } from '@propertypro/shared';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';

/**
 * Content blocks occupy block_order 2..99; the hero is reserved at order 1
 * (spec §2.7). Reorder operates only on content blocks, so reads start here.
 */
const MIN_CONTENT_BLOCK_ORDER = 2;

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
}

export async function upsertPublishedBlock({
  communityId,
  actorUserId,
  blockType,
  blockOrder,
  content,
  isDraft = false,
}: UpsertPublishedBlockInput): Promise<void> {
  const db = createUnscopedClient();

  await db.transaction(async (tx) => {
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
    await scoped.softDelete(
      siteBlocks,
      and(
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
      metadata: { blockType, blockOrder, isDraft },
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

    const scoped = createScopedClient(communityId, tx as unknown as Parameters<typeof createScopedClient>[1]);

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

    // Step 3: which block_orders have a live draft? Publish promotes those
    // drafts and retires ONLY the published rows they supersede.
    const draftRows = await tx
      .select({ blockOrder: siteBlocks.blockOrder })
      .from(siteBlocks)
      .where(
        and(
          eq(siteBlocks.communityId, communityId),
          eq(siteBlocks.isDraft, true),
          isNull(siteBlocks.deletedAt),
        ),
      );
    const draftOrders = [...new Set(draftRows.map((r) => r.blockOrder))];

    // No drafts → nothing to publish. Roll back BEFORE any mutation so the
    // prior published rows are never touched. Drizzle's transaction wrapper
    // undoes the (no-op) tx and the outer .catch converts the sentinel.
    if (draftOrders.length === 0) {
      throw new NothingToPublishRollback();
    }

    // Step 4: soft-delete the published rows AT the slots being republished
    // only — published blocks at slots without a draft survive untouched.
    // Returns the count of rows affected so we can surface it in the audit
    // row and the result object.
    const retiredResult = await tx
      .update(siteBlocks)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(siteBlocks.communityId, communityId),
          eq(siteBlocks.isDraft, false),
          isNull(siteBlocks.deletedAt),
          inArray(siteBlocks.blockOrder, draftOrders),
        ),
      )
      .returning({ id: siteBlocks.id });
    const retiredCount = retiredResult.length;

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

    // Step 6: audit row inside the same tx so the publish has atomic
    // provenance.
    await insertAuditEventInTransaction(tx as unknown as AuditInsertExecutor, {
      userId: actorUserId,
      communityId,
      action: 'update',
      resourceType: 'community_site',
      resourceId: String(communityId),
      metadata: { retiredCount, promotedCount, publishedAt: publishedAt.toISOString() },
    });

    // Mark Drizzle that we want to keep the work — the explicit return
    // here means the implicit COMMIT runs.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return { published: true as const, publishedAt, promotedCount, retiredCount };
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

    const scoped = createScopedClient(
      communityId,
      tx as unknown as Parameters<typeof createScopedClient>[1],
    );

    // Read the community's non-deleted content blocks (order >= 2; the hero at
    // order 1 is excluded). Build the same merged draft-wins view the editor
    // sees so the swap operates on the rows the PM is actually looking at.
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

    const scoped = createScopedClient(
      communityId,
      tx as unknown as Parameters<typeof createScopedClient>[1],
    );

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
        eq(siteBlocks.blockOrder, blockOrder),
        eq(siteBlocks.isDraft, true),
        isNull(siteBlocks.deletedAt),
      ),
    );

    if (hasPublished) {
      await scoped.insert(siteBlocks, {
        communityId,
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
}

/**
 * Discards every pending draft for the community — staged edits, staged
 * reorders, and staged deletions (tombstones) alike. Published rows are
 * untouched, so the editor snaps back to exactly what the live site shows.
 * Without this, a staged change could only be escaped by publishing it.
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

    if (discardedCount > 0) {
      await insertAuditEventInTransaction(tx as unknown as AuditInsertExecutor, {
        userId: actorUserId,
        communityId,
        action: 'delete',
        resourceType: 'community_site_drafts',
        resourceId: String(communityId),
        metadata: { discardedCount },
      });
    }

    return { discardedCount };
  });
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

