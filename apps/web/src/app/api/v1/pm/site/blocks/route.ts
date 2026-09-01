/**
 * PR #2: PM site editor — content blocks endpoint.
 *
 * GET    /api/v1/pm/site/blocks?communityId=X   — list community's blocks
 * PATCH  /api/v1/pm/site/blocks                 — upsert a content block at (blockType, blockOrder)
 * DELETE /api/v1/pm/site/blocks                 — remove the content block at blockOrder
 *                                                 (staged via tombstone draft when published)
 *
 * Authorization: caller must hold pm_admin or cam in the community AND the
 * community's plan must include hasSiteEditor.
 *
 * Validation: PATCH body's `content` is validated against the per-type
 * schema from blockSchemaRegistry. The contract layer validates the
 * envelope (communityId, blockType enum, blockOrder bounds); the route
 * runs the per-block content schema explicitly so the right schema
 * applies (text vs image — different shapes).
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { blockSchemaRegistry } from '@propertypro/shared';
import {
  assertPathsScopedToCommunity,
  collectBlockAssetPaths,
} from '@/lib/site-assets/scoped-paths';
import { removeSiteBlock, upsertPublishedBlock } from '@/lib/services/site-blocks-service';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { blocksDeleteContract, blocksListContract, blocksUpsertContract } from './contract';
import type { NextRequest } from 'next/server';

/**
 * Pro+ "polish" block types. On top of the hasSiteEditor gate every block
 * passes, these require the hasSitePolishBlocks plan feature. gallery is
 * listed ahead of its editor (PR #10d); the upsert contract enum is the gate
 * on which types can actually reach this handler today (faq + amenities in
 * #10c).
 */
const POLISH_BLOCK_TYPES = new Set<string>(['faq', 'gallery', 'amenities']);

async function ensurePmAccess(req: NextRequest, communityId: number) {
  const userId = await requireAuthenticatedUserId();
  const effective = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effective, userId);
  requireRole(membership, PM_MANAGER_ROLES, 'Only property managers can manage site blocks');
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective, membership };
}

export const GET = withErrorHandler(
  runRoute(blocksListContract, async ({ query, req }) => {
    const { communityId, membership } = await ensurePmAccess(req, query.communityId);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);
    const reader = getPublicCommunityScopedReader(communityId);
    // PR #8e — the editor view merges draft + published (draft wins per
    // block_order) so PMs see and edit pending changes; the public site
    // continues to use the default published-only read. Tombstones (staged
    // deletions, slice 8f) are included so the PublishBar's pending count
    // covers them — the editor list itself filters them from display.
    // latestPublishedAt is the authoritative publish token (max over ALL
    // published rows, incl. those shadowed in the merge) so the editor never
    // derives a stale-low token from the merged list.
    // The second read is the published side, with no opts — published rows
    // only, no drafts, no tombstones. The change model (Phase 4) diffs it
    // against the merged view; without it the editor can show WHAT the site
    // says but not what CHANGED, which is the whole point of the review sheet.
    const pageFilter = query.pageId === undefined ? {} : { pageId: query.pageId };
    const [rows, publishedRows, latestPublishedAt] = await Promise.all([
      reader.listSiteBlocks({ includeDrafts: true, includeTombstones: true, ...pageFilter }),
      reader.listSiteBlocks({ ...pageFilter }),
      reader.getLatestPublishedAt(),
    ]);
    const toSummary = (r: (typeof rows)[number]) => ({
      id: r.id,
      pageId: r.pageId,
      blockType: r.blockType,
      blockOrder: r.blockOrder,
      content: r.content,
      isDraft: r.isDraft,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    });
    return {
      blocks: rows.map(toSummary),
      publishedBlocks: publishedRows.map(toSummary),
      latestPublishedAt: latestPublishedAt ? latestPublishedAt.toISOString() : null,
    };
  }),
);

export const PATCH = withErrorHandler(
  runRoute(blocksUpsertContract, async ({ body, req }) => {
    const { userId, communityId } = await ensurePmAccess(req, body.communityId);

    // Pro+ gate: the polish block types require hasSitePolishBlocks on top of
    // the hasSiteEditor gate ensurePmAccess already enforced. Essentials PMs
    // get a 403 PLAN_UPGRADE_REQUIRED here.
    if (POLISH_BLOCK_TYPES.has(body.blockType)) {
      await requirePlanFeature(communityId, 'hasSitePolishBlocks');
    }

    const schema = blockSchemaRegistry[body.blockType as keyof typeof blockSchemaRegistry];
    if (!schema) {
      throw new ValidationError(`Unknown blockType: ${body.blockType}`);
    }
    const parse = schema.safeParse(body.content);
    if (!parse.success) {
      throw new ValidationError('Invalid block content', { fields: formatZodErrors(parse.error) });
    }

    // Defense-in-depth, shared with /api/v1/pm/site/hero: bind each stored
    // asset path's leading segment to the editing community. `imagePathSchema`
    // validates only the shape `{digits}/{kind}/…`, so any digits pass — an
    // `image` block's `imagePath`, or any of a gallery's up-to-24
    // `images[].imagePath`, could otherwise persist a foreign community id.
    // Runs on `parse.data`, after the per-type schema has vouched for shape.
    assertPathsScopedToCommunity(
      communityId,
      collectBlockAssetPaths(body.blockType, parse.data),
    );

    // PR #8e — PM edits write to the draft row at this slot. The public
    // site continues to serve the last-published row until the PM clicks
    // Publish, which atomically promotes drafts via publishCommunitySite.
    await upsertPublishedBlock({
      communityId,
      actorUserId: userId,
      blockType: body.blockType,
      blockOrder: body.blockOrder,
      content: parse.data,
      isDraft: true,
      ...(body.pageId === undefined ? {} : { pageId: body.pageId }),
    });

    return { ok: true as const };
  }),
);

export const DELETE = withErrorHandler(
  runRoute(blocksDeleteContract, async ({ body, req }) => {
    const { userId, communityId } = await ensurePmAccess(req, body.communityId);

    // No polish-block gate here: removing a section is core editing, even
    // when the section's type is Pro-gated (a downgraded plan must still be
    // able to take Pro blocks off its site).
    const { staged } = await removeSiteBlock({
      communityId,
      actorUserId: userId,
      blockOrder: body.blockOrder,
      ...(body.pageId === undefined ? {} : { pageId: body.pageId }),
    });

    return { ok: true as const, staged };
  }),
);
