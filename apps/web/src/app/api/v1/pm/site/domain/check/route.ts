/**
 * Domain availability check for the guided-purchase flow.
 *
 * GET /api/v1/pm/site/domain/check?communityId=X&name=example.com
 *
 * Read-only: asks the provider whether the domain is available to register
 * and (best-effort) its indicative price. The app NEVER buys the domain —
 * the UI links the PM to a registrar and guides them back to the connect
 * flow. Same gate as the sibling domain routes, including assertNotDemoGrace
 * (demo tenants shouldn't burn provider quota).
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { checkPurchasableDomain } from '@/lib/services/custom-domain-service';
import { domainCheckContract } from './contract';
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

export const GET = withErrorHandler(
  runRoute(domainCheckContract, async ({ query, req }) => {
    await gate(req, query.communityId);
    return checkPurchasableDomain(query.name);
  }),
);
