/**
 * Custom-domain verification API for property managers.
 *
 * POST /api/v1/pm/site/domain/verify — re-check provider status; flip to
 * `active` + stamp `verifiedAt` on first success.
 *
 * A1 route — uses `runRoute(contract, handler)`; see `./contract.ts`. The
 * `gate()` mirrors the parent domain route's auth chain (a tiny local copy to
 * avoid cross-route imports).
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import * as svc from '@/lib/services/custom-domain-service';
import { domainVerifyContract } from './contract';
import type { NextRequest } from 'next/server';

async function gate(req: NextRequest, communityIdInput: number) {
  const userId = await requireAuthenticatedUserId();
  const communityId = resolveEffectiveCommunityId(req, communityIdInput);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, userId);
  requireRole(membership, PM_MANAGER_ROLES, 'Only property managers can manage the custom domain');
  await requirePlanFeature(communityId, 'hasSiteCustomDomain');
  return { userId, communityId };
}

export const POST = withErrorHandler(
  runRoute(domainVerifyContract, async ({ body, req }) => {
    const { userId, communityId } = await gate(req, body.communityId);
    return svc.verifyDomain(communityId, userId);
  }),
);
