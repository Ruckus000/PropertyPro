/**
 * Website builder v4, Phase 4 — `/api/v1/pm/site/design`.
 *
 * GET   — the live look and the unpublished draft changes.
 * PATCH — save part of the look as a draft. Nothing goes live until Publish.
 *
 * Authorization matches publish, site settings and the urgent notice
 * (`ensurePmAccess`): a PM manager role in the target community plus the
 * `hasSiteEditor` plan feature. Custom colours additionally need
 * `hasSiteCustomCss`, and a write is refused during a demo's grace window, as
 * on `/api/v1/pm/branding` (which no longer accepts look fields at all).
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { getSiteDesign, saveDraftDesign } from '@/lib/services/site-design-service';
import { siteDesignGetContract, siteDesignPatchContract } from './contract';
import type { NextRequest } from 'next/server';

async function ensurePmAccess(
  req: NextRequest,
  communityId: number,
  { write }: { write: boolean },
) {
  const userId = await requireAuthenticatedUserId();
  // The middleware `x-community-id` header is authoritative; the id in the
  // query/body is the cross-checked redundant value.
  const effective = resolveEffectiveCommunityId(req, communityId);
  // A demo in its grace window is read-only, as on `/api/v1/pm/branding`,
  // whose look writes moved here. Before membership, per api-patterns.md.
  if (write) await assertNotDemoGrace(effective);
  const membership = await requireCommunityMembership(effective, userId);
  requireRole(membership, PM_MANAGER_ROLES, 'Only property managers can change the site design');
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective, membership };
}

export const GET = withErrorHandler(
  runRoute(siteDesignGetContract, async ({ query, req }) => {
    const { communityId, membership } = await ensurePmAccess(req, query.communityId, { write: false });
    await requireEntitledForAdminRead(communityId, membership);
    return getSiteDesign(communityId);
  }),
);

export const PATCH = withErrorHandler(
  runRoute(siteDesignPatchContract, async ({ body, req }) => {
    const { userId, communityId } = await ensurePmAccess(req, body.communityId, { write: true });
    const { communityId: _id, ...patch } = body;
    if (patch.customCssOverrides !== undefined) {
      await requirePlanFeature(communityId, 'hasSiteCustomCss');
    }
    return saveDraftDesign(communityId, patch, { actorUserId: userId });
  }),
);
