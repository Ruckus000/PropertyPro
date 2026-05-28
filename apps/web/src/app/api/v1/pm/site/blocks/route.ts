/**
 * PR #2: PM site editor — content blocks endpoint.
 *
 * GET   /api/v1/pm/site/blocks?communityId=X   — list community's blocks
 * PATCH /api/v1/pm/site/blocks                 — upsert a content block at (blockType, blockOrder)
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
import { requireRole } from '@/lib/api/role-guard';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { blockSchemaRegistry } from '@propertypro/shared';
import { upsertPublishedBlock } from '@/lib/services/site-blocks-service';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { blocksListContract, blocksUpsertContract } from './contract';
import type { NextRequest } from 'next/server';

async function ensurePmAccess(req: NextRequest, communityId: number) {
  const userId = await requireAuthenticatedUserId();
  const effective = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effective, userId);
  requireRole(membership, ['pm_admin', 'cam'], 'Only property managers can manage site blocks');
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective };
}

export const GET = withErrorHandler(
  runRoute(blocksListContract, async ({ query, req }) => {
    const { communityId } = await ensurePmAccess(req, query.communityId);
    const reader = getPublicCommunityScopedReader(communityId);
    // PR #8e — the editor view merges draft + published (draft wins per
    // block_order) so PMs see and edit pending changes; the public site
    // continues to use the default published-only read.
    const rows = await reader.listSiteBlocks({ includeDrafts: true });
    const blocks = rows.map((r) => ({
      id: r.id,
      blockType: r.blockType,
      blockOrder: r.blockOrder,
      content: r.content,
      isDraft: r.isDraft,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    }));
    return { blocks };
  }),
);

export const PATCH = withErrorHandler(
  runRoute(blocksUpsertContract, async ({ body, req }) => {
    const { userId, communityId } = await ensurePmAccess(req, body.communityId);

    const schema = blockSchemaRegistry[body.blockType as keyof typeof blockSchemaRegistry];
    if (!schema) {
      throw new ValidationError(`Unknown blockType: ${body.blockType}`);
    }
    const parse = schema.safeParse(body.content);
    if (!parse.success) {
      throw new ValidationError('Invalid block content', { fields: formatZodErrors(parse.error) });
    }

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
    });

    return { ok: true as const };
  }),
);
