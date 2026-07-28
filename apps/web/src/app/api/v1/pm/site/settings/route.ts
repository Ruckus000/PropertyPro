/**
 * Website editor v3, Phase 8 — `/api/v1/pm/site/settings`.
 *
 * GET   — the community's SEO settings and footer fields.
 * PATCH — update either or both. Public on the next request.
 *
 * Authorization is byte-identical to publish and to the urgent notice: the same
 * `ensurePmAccess` shape used by `site/publish`, `site/hero` and
 * `site/urgent-notice`. Anyone who can publish the site can change its title
 * and footer, and nobody else can.
 *
 * These writes are unstaged. `communities.branding` is not part of the draft
 * layer — the publish flow promotes `site_blocks` rows only — so a change here
 * reaches the live public site immediately, exactly like the community's
 * colours, tagline and custom domain already do.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { getSiteSettings, updateSiteSettings } from '@/lib/services/site-settings-service';
import { siteSettingsGetContract, siteSettingsPatchContract } from './contract';
import type { NextRequest } from 'next/server';

async function ensurePmAccess(req: NextRequest, communityId: number) {
  const userId = await requireAuthenticatedUserId();
  // The middleware `x-community-id` header is authoritative; the id in the
  // query/body is the cross-checked redundant value. A caller who is a manager
  // of community A cannot address community B by editing the payload.
  const effective = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effective, userId);
  requireRole(
    membership,
    PM_MANAGER_ROLES,
    'Only property managers can change site settings',
  );
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective, membership };
}

export const GET = withErrorHandler(
  runRoute(siteSettingsGetContract, async ({ query, req }) => {
    const { communityId, membership } = await ensurePmAccess(req, query.communityId);
    // Admin reads are additionally gated on entitlement (§4.1, enforced by
    // `guard:read-entitlement`). A lapsed community's manager cannot read.
    await requireEntitledForAdminRead(communityId, membership);
    return getSiteSettings(communityId);
  }),
);

export const PATCH = withErrorHandler(
  runRoute(siteSettingsPatchContract, async ({ body, req }) => {
    const { userId, communityId } = await ensurePmAccess(req, body.communityId);

    // `updateSiteSettings` throws ValidationError (400) when a value exceeds
    // its cap once trimmed and measured in code points — the check the client's
    // `maxLength` cannot express. `withErrorHandler` maps it to the canonical
    // error envelope.
    return updateSiteSettings({
      communityId,
      actorUserId: userId,
      seoTitle: body.seoTitle,
      seoDescription: body.seoDescription,
      searchIndexing: body.searchIndexing,
      associationName: body.associationName,
      note: body.note,
      showStatutoryLine: body.showStatutoryLine,
    });
  }),
);
