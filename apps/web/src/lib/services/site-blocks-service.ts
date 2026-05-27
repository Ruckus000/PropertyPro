/**
 * Site Blocks Service
 *
 * Mutation entry points for community site blocks. Authenticated writes
 * only — tenant-scoped via createScopedClient. Audit-logged.
 *
 * PR #1b ships `upsertPublishedHero` only — a hero-only shortcut that
 * replaces the currently published hero row: soft-delete old, then insert
 * new. PR #8 generalises this to the full atomic community-wide publish
 * workflow with draft → published promotion.
 *
 * NOTE: ScopedClient does not expose a raw Drizzle transaction handle.
 * The two operations (soft-delete + insert) are sequential. A failure on
 * the insert will leave the old row soft-deleted; the route-level error
 * handler surfaces a 500 so the caller can retry. Full transactionality
 * is a PR #8 concern that will require adding this service to the
 * WEB_UNSAFE_IMPORT_ALLOWLIST with a documented auth contract.
 */
import {
  createScopedClient,
  logAuditEvent,
  siteBlocks,
} from '@propertypro/db';
import { and, eq, isNull } from '@propertypro/db/filters';
import type { HeroBlockContent } from '@propertypro/shared';

export interface UpsertPublishedHeroInput {
  communityId: number;
  actorUserId: string;
  content: HeroBlockContent;
}

export async function upsertPublishedHero({
  communityId,
  actorUserId,
  content,
}: UpsertPublishedHeroInput): Promise<void> {
  const scoped = createScopedClient(communityId);

  // Step 1: Soft-delete any existing published hero row for this community.
  await scoped.softDelete(
    siteBlocks,
    and(
      eq(siteBlocks.blockType, 'hero'),
      eq(siteBlocks.isDraft, false),
      isNull(siteBlocks.deletedAt),
    ),
  );

  // Step 2: Insert the new published hero at block_order 1.
  await scoped.insert(siteBlocks, {
    communityId,
    blockType: 'hero',
    blockOrder: 1,
    isDraft: false,
    publishedAt: new Date(),
    content,
  });

  // Audit-log AFTER both mutations complete. logAuditEvent uses a privileged
  // postgres connection (see packages/db/src/utils/audit-logger.ts) so it
  // must run outside the scoped client context.
  await logAuditEvent({
    userId: actorUserId,
    communityId,
    action: 'update',
    resourceType: 'site_block',
    resourceId: 'hero',
    metadata: { blockType: 'hero' },
  });
}
