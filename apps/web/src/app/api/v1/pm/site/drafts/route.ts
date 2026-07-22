/**
 * PM site editor — pending drafts endpoint.
 *
 * DELETE /api/v1/pm/site/drafts — discard every pending draft for the
 * community (staged edits, reorders, and deletions). Published rows are
 * untouched; the editor snaps back to the live site's state. Companion to
 * POST /api/v1/pm/site/publish, which promotes the same draft set.
 *
 * Authorization: caller must hold pm_admin or cam in the community AND the
 * community's plan must include hasSiteEditor (same gate as the blocks
 * endpoints — anyone who can stage drafts can discard them).
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { discardSiteDrafts } from '@/lib/services/site-blocks-service';
import { draftsDiscardContract } from './contract';
import type { NextRequest } from 'next/server';

async function ensurePmAccess(req: NextRequest, communityId: number) {
  const userId = await requireAuthenticatedUserId();
  const effective = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effective, userId);
  requireRole(membership, PM_MANAGER_ROLES, 'Only property managers can manage site drafts');
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective };
}

export const DELETE = withErrorHandler(
  runRoute(draftsDiscardContract, async ({ body, req }) => {
    const { userId, communityId } = await ensurePmAccess(req, body.communityId);

    const { discardedCount } = await discardSiteDrafts({
      communityId,
      actorUserId: userId,
    });

    return { ok: true as const, discardedCount };
  }),
);
