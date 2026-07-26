/**
 * POST /api/v1/pm/site/publish/revert — restore a past publish into the draft
 * layer.
 *
 * Website editor v3, Phase 6. Thin wrapper around `revertToSnapshot`.
 *
 * Authorization: the same `ensurePmAccess` chain the sibling site routes use
 * (auth → effective community → membership → PM_MANAGER_ROLES → hasSiteEditor)
 * and nothing more. Revert is available on EVERY plan by design (gap-analysis
 * decision 5) — a PM whose public site is broken must be able to undo it
 * whatever they pay. The history LIST is the gated surface, not the escape
 * hatch.
 *
 * The service pins the snapshot lookup to `communityId`, so a snapshot id
 * belonging to another association cannot be restored here regardless of what
 * the body claims.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { revertToSnapshot } from '@/lib/services/site-blocks-service';
import { publishRevertContract } from './contract';
import type { NextRequest } from 'next/server';

async function ensurePmAccess(req: NextRequest, communityId: number) {
  const userId = await requireAuthenticatedUserId();
  const effective = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effective, userId);
  requireRole(membership, PM_MANAGER_ROLES, 'Only property managers can revert the community site');
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective };
}

export const POST = withErrorHandler(
  runRoute(publishRevertContract, async ({ body, req }) => {
    const { userId, communityId } = await ensurePmAccess(req, body.communityId);

    // NotFoundError (404) for an unknown/other-community snapshot id;
    // ValidationError (400) for a retention-pruned entry. Both are mapped by
    // withErrorHandler — neither is a 500.
    const result = await revertToSnapshot({
      communityId,
      actorUserId: userId,
      snapshotId: body.snapshotId,
    });

    return {
      ok: true as const,
      snapshotId: result.snapshotId,
      restoredPublishedAt: result.restoredPublishedAt.toISOString(),
      restoredCount: result.restoredCount,
      stagedRemovalCount: result.stagedRemovalCount,
      clearedDraftCount: result.clearedDraftCount,
    };
  }),
);
