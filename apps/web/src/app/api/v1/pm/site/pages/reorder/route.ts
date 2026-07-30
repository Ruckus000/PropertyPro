/**
 * PM site editor — page nav order (website editor v3, Phase 11b).
 *
 * POST /api/v1/pm/site/pages/reorder
 *
 * Separate from the pages collection route for the same reason
 * `blocks/reorder` is separate from `blocks`: reordering is not an update to one
 * resource, it is a rewrite of the whole ordering, and giving it its own path
 * keeps the PATCH body from having two mutually exclusive meanings.
 *
 * Home is pinned first and must not appear in `orderedPageIds` — the service
 * rejects a list that does not match the community's non-home pages exactly.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { reorderSitePages } from '@/lib/services/site-pages-service';
import { pagesReorderContract } from '../contract';
import type { NextRequest } from 'next/server';

async function ensurePmAccess(req: NextRequest, communityId: number) {
  const userId = await requireAuthenticatedUserId();
  const effective = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effective, userId);
  requireRole(membership, PM_MANAGER_ROLES, 'Only property managers can manage site pages');
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective };
}

export const POST = withErrorHandler(
  runRoute(pagesReorderContract, async ({ body, req }) => {
    const { userId, communityId } = await ensurePmAccess(req, body.communityId);

    // reorderSitePages throws ValidationError (400) when the submitted list does
    // not cover exactly the community's non-home pages — a stale editor, rather
    // than a partial reorder it would otherwise apply.
    const pages = await reorderSitePages({
      communityId,
      actorUserId: userId,
      orderedPageIds: body.orderedPageIds,
    });

    return {
      ok: true as const,
      pages: pages.map((page) => ({
        id: page.id,
        name: page.name,
        slug: page.slug,
        inNav: page.inNav,
        sortOrder: page.sortOrder,
        isHome: page.isHome,
        isDraft: page.isDraft,
        publishedAt: page.publishedAt ? page.publishedAt.toISOString() : null,
        deleteStagedAt: page.deleteStagedAt ? page.deleteStagedAt.toISOString() : null,
      })),
    };
  }),
);
