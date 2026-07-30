/**
 * PR #8 (deferred): PM site editor — per-block reorder endpoint.
 *
 * POST /api/v1/pm/site/blocks/reorder — move a content block, either one
 * position (`direction`) or to an absolute slot (`toOrder`, the v3 editor's
 * drag-and-drop). The move is written to the draft layer (spec §2.7); the
 * public site keeps serving the last-published order until the PM publishes.
 *
 * Authorization: caller must hold pm_admin or cam in the community AND the
 * community's plan must include hasSiteEditor — the same gate the sibling
 * blocks/hero/publish routes use. Reorder is a core editor action, so there is
 * no additional polish-block (Pro+) gate.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { reorderSiteBlock } from '@/lib/services/site-blocks-service';
import { reorderBlockContract } from './contract';
import type { NextRequest } from 'next/server';

async function ensurePmAccess(req: NextRequest, communityId: number) {
  const userId = await requireAuthenticatedUserId();
  const effective = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effective, userId);
  requireRole(membership, PM_MANAGER_ROLES, 'Only property managers can reorder site blocks');
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective };
}

export const POST = withErrorHandler(
  runRoute(reorderBlockContract, async ({ body, req }) => {
    const { userId, communityId } = await ensurePmAccess(req, body.communityId);

    // reorderSiteBlock throws NotFoundError (404) when the block isn't a
    // content block of this community, and ValidationError (400) when the block
    // is already at the end in the requested direction or when `toOrder` names
    // a slot that is not a content section. withErrorHandler maps both to the
    // canonical error envelope.
    //
    // The contract guarantees exactly one of direction/toOrder is present, so
    // the keys are spread conditionally rather than passed as `undefined` —
    // the service rejects "both supplied", and an explicit `undefined` value
    // would still read as supplied to `in`-style checks.
    const result = await reorderSiteBlock({
      communityId,
      actorUserId: userId,
      blockId: body.blockId,
      ...(body.direction !== undefined
        ? { direction: body.direction }
        : { toOrder: body.toOrder }),
      ...(body.pageId === undefined ? {} : { pageId: body.pageId }),
    });

    return { ok: true as const, ...result };
  }),
);
