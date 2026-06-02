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
 * for `createUnscopedClient` import. Callers MUST verify pm_admin / cam
 * membership and the `hasSiteEditor` plan feature at the route layer.
 */
import {
  complianceAuditLog,
  createScopedClient,
  siteBlocks,
  type AuditAction,
} from '@propertypro/db';
import { and, desc, eq, inArray, isNotNull, isNull, lt, sql } from '@propertypro/db/filters';
// AUTHZ: PR #8a atomic site-blocks publish — caller (route layer) verifies pm_admin + hasSiteEditor.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import type { HeroBlockContent } from '@propertypro/shared';
import { ConflictError } from '@/lib/api/errors';

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

