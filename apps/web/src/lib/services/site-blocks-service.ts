/**
 * Site Blocks Service
 *
 * Mutation entry points for community site blocks. Authenticated writes
 * only — tenant-scoped via createScopedClient. Audit-logged.
 *
 * PR #1b shipped `upsertPublishedHero`. PR #2 factors the publish primitive
 * into `upsertPublishedBlock(...)` so text and image blocks can use the
 * same machinery. `upsertPublishedHero` is now a thin caller — PR #1b's
 * external contract is preserved.
 *
 * NOTE: ScopedClient does not expose a raw Drizzle transaction handle.
 * The two operations (soft-delete + insert) are sequential. A failure on
 * the insert will leave the old row soft-deleted; the route-level error
 * handler surfaces a 500 so the caller can retry. A retry is safe: the
 * soft-delete step filters on isNull(deletedAt), so it is a no-op when
 * the old row is already soft-deleted, and the insert proceeds normally.
 * Full transactionality is a PR #8 concern that will require adding this
 * service to the WEB_UNSAFE_IMPORT_ALLOWLIST.
 */
import { createScopedClient, logAuditEvent, siteBlocks } from '@propertypro/db';
import { and, eq, isNull } from '@propertypro/db/filters';
import type { HeroBlockContent } from '@propertypro/shared';

export interface UpsertPublishedBlockInput {
  communityId: number;
  actorUserId: string;
  blockType: string;
  blockOrder: number;
  content: unknown;
}

export async function upsertPublishedBlock({
  communityId,
  actorUserId,
  blockType,
  blockOrder,
  content,
}: UpsertPublishedBlockInput): Promise<void> {
  const scoped = createScopedClient(communityId);

  // Step 1: Soft-delete any existing published row at this blockOrder.
  //
  // The predicate intentionally does NOT include blockType. The partial
  // unique index `site_blocks_community_order_draft_variant_partial` is
  // keyed on (community_id, block_order, is_draft, template_variant)
  // WHERE deleted_at IS NULL — block_type is NOT part of the uniqueness
  // constraint. Filtering soft-delete on block_type would leave a row of
  // a different type at the same order, and the subsequent insert would
  // collide on the partial unique index → opaque 500. Match the index's
  // shape so "replace whatever lives at this slot" works regardless of
  // the previous block's type.
  await scoped.softDelete(
    siteBlocks,
    and(
      eq(siteBlocks.blockOrder, blockOrder),
      eq(siteBlocks.isDraft, false),
      isNull(siteBlocks.deletedAt),
    ),
  );

  // Step 2: Insert the new published row.
  await scoped.insert(siteBlocks, {
    communityId,
    blockType,
    blockOrder,
    isDraft: false,
    publishedAt: new Date(),
    content: content as Record<string, unknown>,
  });

  // Audit log fires AFTER mutations. logAuditEvent uses a privileged
  // postgres connection (see packages/db/src/utils/audit-logger.ts) so it
  // must run outside the scoped-client context.
  await logAuditEvent({
    userId: actorUserId,
    communityId,
    action: 'update',
    resourceType: 'site_block',
    resourceId: blockType,
    metadata: { blockType, blockOrder },
  });
}

export interface UpsertPublishedHeroInput {
  communityId: number;
  actorUserId: string;
  content: HeroBlockContent;
}

/**
 * Back-compat caller (PR #1b's contract). Delegates to upsertPublishedBlock
 * with blockType='hero' and blockOrder=1.
 */
export async function upsertPublishedHero({
  communityId,
  actorUserId,
  content,
}: UpsertPublishedHeroInput): Promise<void> {
  return upsertPublishedBlock({
    communityId,
    actorUserId,
    blockType: 'hero',
    blockOrder: 1,
    content,
  });
}
