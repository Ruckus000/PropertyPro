/**
 * Website editor v3 — route entry.
 *
 * Route: /pm/website-editor?communityId=X
 *
 * This is the only website editor. The stacked-form predecessor at
 * /pm/settings/website is retired; that path now redirects here, and the
 * `SITE_EDITOR_V3_ENABLED` flag that gated the rollout is gone with it.
 *
 * The path stays under `/pm` deliberately: that prefix is in
 * `PROTECTED_PATH_PREFIXES` (apps/web/src/middleware.ts), so middleware session
 * protection applies to this route.
 *
 * ## Authorization
 *
 * Middleware guarantees a session and nothing more. Role, tenancy, plan and
 * subscription state are all enforced here.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { resolveLifecycleState, isEntitledState } from '@propertypro/shared';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { hasRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { getEffectiveFeaturesForPage } from '@/lib/middleware/plan-guard';
import { getPageShellContext } from '@/lib/request/page-shell-context';
import { buildCommunityUrl } from '@/lib/utils/community-url';
import {
  getBrandingForCommunity,
  getCommunityPublicInfo,
  getSiteOnboardingCompletedAt,
} from '@/lib/api/branding';
import { EditorFrame } from '@/components/pm/site-editor-v3/EditorFrame';
import { EditorRoot } from '@/components/pm/site-editor-v3/EditorRoot';
import { loadCanvasContext } from '@/lib/site-editor/load-canvas-context';
import {
  resolveFooterSettings,
  resolveSiteSettings,
} from '@/lib/site-editor/site-settings';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function WebsiteEditorV3Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);
  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/pm/dashboard/communities?reason=invalid-selection');
  }
  const communityId = rawId;

  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId!);
  if (!hasRole(membership, PM_MANAGER_ROLES)) {
    redirect('/pm/dashboard/communities?reason=invalid-selection');
  }

  const [
    features,
    shellContext,
    communityInfo,
    canvasContext,
    branding,
    onboardingCompletedAt,
  ] = await Promise.all([
    getEffectiveFeaturesForPage(communityId, membership.communityType),
    // Only for the signed-in user's display name. Everything community-scoped
    // comes from `membership` — see the lifecycle note below.
    getPageShellContext(),
    getCommunityPublicInfo(communityId),
    loadCanvasContext(communityId),
    // Phase 8. Free: `getBrandingForCommunity` is React.cache'd and
    // `loadCanvasContext` above already reads it, so this resolves from the
    // same request-scoped result rather than issuing a second SELECT.
    getBrandingForCommunity(communityId),
    // The canonical "wizard never finished" signal, stamped by the wizard's
    // final-step publish. Read here rather than inferred from branding, for the
    // same reason the legacy editor read it: `branding.layoutId` being unset was
    // a substitute heuristic and got this wrong.
    getSiteOnboardingCompletedAt(communityId),
  ]);

  if (!features.hasSiteEditor) {
    redirect('/pm/dashboard/communities?reason=feature-unavailable');
  }

  // Lapsed-community route gate (gap analysis §9 row 4). Rather than render the
  // shell's billing banners inside a full-bleed editor, a lapsed community never
  // reaches the editor at all. This mirrors `requireEntitledForAdminRead` for
  // API routes, but redirects instead of throwing — a 403 thrown from a page
  // renders an error boundary, which is the wrong affordance for "your
  // subscription needs attention".
  //
  // The subscription fields come from `membership`, NOT from the shell context.
  // The PM portal carries no tenant header, so `getPageShellContext()` resolves
  // to a null community and null subscription state — gating on it would check
  // no community at all and let every lapsed community straight through.
  // `requireCommunityMembership` already loaded the *target* community's row.
  const lifecycleState = resolveLifecycleState({
    subscriptionStatus: membership.subscriptionStatus,
    subscriptionCanceledAt: membership.subscriptionCanceledAt,
    freeAccessExpiresAt: membership.freeAccessExpiresAt,
  });
  if (!isEntitledState(lifecycleState)) {
    redirect('/pm/dashboard/communities?reason=subscription-lapsed');
  }

  return (
    <EditorFrame
      communityId={communityId}
      communityName={membership.communityName}
      communityType={membership.communityType}
      role={membership.role}
      isUnitOwner={membership.isUnitOwner}
      designation={membership.designation}
      features={features}
      userName={shellContext.user?.fullName ?? null}
      plan={membership.subscriptionPlan}
    >
      <EditorRoot
        communityId={communityId}
        communityName={membership.communityName}
        publicSiteUrl={communityInfo ? buildCommunityUrl(communityInfo.slug, '/') : null}
        proToolAccess={{
          styling: features.hasSiteCustomCss,
          domain: features.hasSiteCustomDomain,
        }}
        // Separate from `proToolAccess` on purpose: that map gates whole TOOLS
        // and would lock the Add tab. This gates three rows inside it.
        hasPolishBlocks={features.hasSitePolishBlocks}
        canvasContext={canvasContext}
        // Phase 7. Both derived from the `getCommunityPublicInfo` read above, so
        // the notice panel and the phone-gate fast path open with real state and
        // no extra query. `hasPublishedSite` is only a UI affordance — the route
        // refuses the write independently (409) whatever this says.
        hasPublishedSite={communityInfo?.sitePublishedAt != null}
        initialNotice={
          communityInfo?.urgentNoticeText
            ? {
                text: communityInfo.urgentNoticeText,
                expiresAt: communityInfo.urgentNoticeExpiresAt?.toISOString() ?? null,
                setAt: null,
              }
            : null
        }
        // Phase 8. Same trick as the notice: derived from reads already made,
        // so the Site panel paints real values instead of a spinner. The
        // resolvers are total, so malformed branding yields defaults here
        // rather than throwing during render.
        siteIdentity={{
          name: membership.communityName,
          slug: communityInfo?.slug ?? '',
          communityType: membership.communityType as 'condo_718' | 'hoa_720' | 'apartment',
        }}
        tagline={branding?.tagline ?? null}
        initialSiteSettings={{
          settings: resolveSiteSettings(branding),
          footer: resolveFooterSettings(branding),
        }}
        // From the same free `branding` read as the settings above, so the
        // Colours panel opens on the community's real overrides. The Address
        // panel gets no equivalent on purpose — its state lives at the domain
        // provider, and seeding it here would put that round-trip on every
        // editor load for a tab most PMs never open.
        initialCustomCss={branding?.customCssOverrides ?? null}
        showWizardBanner={onboardingCompletedAt === null}
      />
    </EditorFrame>
  );
}
