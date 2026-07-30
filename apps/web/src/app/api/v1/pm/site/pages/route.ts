/**
 * PM site editor — pages endpoint (website editor v3, Phase 11b).
 *
 * GET    /api/v1/pm/site/pages?communityId=X  — list the community's pages
 * POST   /api/v1/pm/site/pages                — create an unpublished page
 * PATCH  /api/v1/pm/site/pages                — rename / re-slug / nav visibility
 * DELETE /api/v1/pm/site/pages                — stage a removal (or cancel one)
 *
 * Authorization: identical to the sibling `blocks` route — management-tier
 * membership in the community AND the `hasSiteEditor` plan feature. Multi-page is
 * deliberately NOT behind a plan flag of its own: it ships wherever the editor does.
 *
 * Two semantics worth knowing before changing anything here, both documented at
 * length in `site-pages-service.ts`: a slug change is LIVE-IMMEDIATE and always
 * mints a permanent redirect, and deleting a PUBLISHED page is STAGED until the
 * next publish.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import {
  createSitePage,
  listSitePages,
  stageSitePageDelete,
  unstageSitePageDelete,
  updateSitePage,
  type SitePageRecord,
} from '@/lib/services/site-pages-service';
import {
  pagesCreateContract,
  pagesDeleteContract,
  pagesListContract,
  pagesUpdateContract,
} from './contract';
import type { NextRequest } from 'next/server';

async function ensurePmAccess(req: NextRequest, communityId: number) {
  const userId = await requireAuthenticatedUserId();
  const effective = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effective, userId);
  requireRole(membership, PM_MANAGER_ROLES, 'Only property managers can manage site pages');
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective, membership };
}

function toSummary(page: SitePageRecord) {
  return {
    id: page.id,
    name: page.name,
    slug: page.slug,
    inNav: page.inNav,
    sortOrder: page.sortOrder,
    isHome: page.isHome,
    isDraft: page.isDraft,
    publishedAt: page.publishedAt ? page.publishedAt.toISOString() : null,
    deleteStagedAt: page.deleteStagedAt ? page.deleteStagedAt.toISOString() : null,
  };
}

export const GET = withErrorHandler(
  runRoute(pagesListContract, async ({ query, req }) => {
    const { communityId, membership } = await ensurePmAccess(req, query.communityId);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);
    // includeDrafts: this is the editor's list, so a page the PM just created has
    // to appear in it. The public site uses its own published-only read.
    const pages = await listSitePages(communityId, { includeDrafts: true });
    return { pages: pages.map(toSummary) };
  }),
);

export const POST = withErrorHandler(
  runRoute(pagesCreateContract, async ({ body, req }) => {
    const { userId, communityId } = await ensurePmAccess(req, body.communityId);
    const page = await createSitePage({
      communityId,
      actorUserId: userId,
      name: body.name,
      slug: body.slug,
      ...(body.inNav === undefined ? {} : { inNav: body.inNav }),
    });
    return { ok: true as const, page: toSummary(page) };
  }),
);

export const PATCH = withErrorHandler(
  runRoute(pagesUpdateContract, async ({ body, req }) => {
    const { userId, communityId } = await ensurePmAccess(req, body.communityId);
    const { page, redirectedFrom } = await updateSitePage({
      communityId,
      actorUserId: userId,
      pageId: body.pageId,
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.slug === undefined ? {} : { slug: body.slug }),
      ...(body.inNav === undefined ? {} : { inNav: body.inNav }),
    });
    return { ok: true as const, page: toSummary(page), redirectedFrom };
  }),
);

export const DELETE = withErrorHandler(
  runRoute(pagesDeleteContract, async ({ body, req }) => {
    const { userId, communityId } = await ensurePmAccess(req, body.communityId);

    if (body.unstage === true) {
      await unstageSitePageDelete({
        communityId,
        actorUserId: userId,
        pageId: body.pageId,
      });
      // `staged` answers "is a removal pending after this call?", so cancelling
      // one is false. It is also false when an unpublished page is deleted
      // outright — the two are distinguishable by the request the caller sent,
      // not by the response, which is why the field is documented as the
      // pending-removal state rather than as an outcome.
      return { ok: true as const, staged: false };
    }

    const { staged } = await stageSitePageDelete({
      communityId,
      actorUserId: userId,
      pageId: body.pageId,
    });
    return { ok: true as const, staged };
  }),
);
