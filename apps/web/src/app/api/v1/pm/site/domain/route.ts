/**
 * Custom-domain management API for property managers.
 *
 * GET    /api/v1/pm/site/domain?communityId=X  — read persisted domain state
 * POST   /api/v1/pm/site/domain                — attach a custom domain
 * DELETE /api/v1/pm/site/domain                — detach the custom domain
 *
 * A1 route — all three methods use `runRoute(contract, handler)`; see
 * `./contract.ts`. The shared `gate()` runs the full auth chain
 * (auth → tenant → not-demo-grace → membership → pm_admin/cam role →
 * hasSiteCustomDomain plan feature).
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import * as svc from '@/lib/services/custom-domain-service';
import { domainGetContract, domainSetContract, domainDeleteContract } from './contract';
import type { NextRequest } from 'next/server';

async function gate(req: NextRequest, communityIdInput: number) {
  const userId = await requireAuthenticatedUserId();
  const communityId = resolveEffectiveCommunityId(req, communityIdInput);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, userId);
  requireRole(membership, PM_MANAGER_ROLES, 'Only property managers can manage the custom domain');
  await requirePlanFeature(communityId, 'hasSiteCustomDomain');
  return { userId, communityId, membership };
}

export const GET = withErrorHandler(
  runRoute(domainGetContract, async ({ query, req }) => {
    const { communityId, membership } = await gate(req, query.communityId);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);
    return svc.getDomain(communityId);
  }),
);

export const POST = withErrorHandler(
  runRoute(domainSetContract, async ({ body, req }) => {
    const { userId, communityId } = await gate(req, body.communityId);
    return svc.setDomain(communityId, userId, body.domain);
  }),
);

export const DELETE = withErrorHandler(
  runRoute(domainDeleteContract, async ({ body, req }) => {
    const { userId, communityId } = await gate(req, body.communityId);
    await svc.removeDomain(communityId, userId);
    return { ok: true as const };
  }),
);
