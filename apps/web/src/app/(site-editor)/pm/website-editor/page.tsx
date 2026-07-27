/**
 * Website editor v3 — route entry.
 *
 * Route: /pm/website-editor?communityId=X
 *
 * ## Why this is not at /pm/settings/website
 *
 * Next.js refuses two parallel pages that resolve to the same path, so the v3
 * editor cannot live in a second route group at the legacy URL — route groups
 * organise the tree, they do not create separate URL namespaces. The v3 editor
 * therefore gets its own path while both editors coexist. Phase 12 retires the
 * stacked-form editor and redirects `/pm/settings/website` here.
 *
 * The path stays under `/pm` deliberately: that prefix is in
 * `PROTECTED_PATH_PREFIXES` (apps/web/src/middleware.ts), so middleware session
 * protection applies to this route exactly as it does to the legacy one.
 *
 * ## Authorization
 *
 * Middleware guarantees a session and nothing more. Role, tenancy, plan and
 * subscription state are enforced here, mirroring the legacy page one-for-one —
 * a flag flip must not be able to widen access.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { resolveLifecycleState, isEntitledState } from '@propertypro/shared';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { hasRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { getEffectiveFeaturesForPage } from '@/lib/middleware/plan-guard';
import { getPageShellContext } from '@/lib/request/page-shell-context';
import { isSiteEditorV3Enabled } from '@/lib/site-editor/flag';
import { buildCommunityUrl } from '@/lib/utils/community-url';
import { getBrandingForCommunity, getCommunityPublicInfo } from '@/lib/api/branding';
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
  // The flag is checked FIRST so that a disabled rollout costs one env read
  // rather than a chain of DB lookups.
  if (!isSiteEditorV3Enabled()) {
    redirect('/pm/dashboard/communities?reason=editor-unavailable');
  }

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

  const [features, shellContext, communityInfo, canvasContext, branding] = await Promise.all([
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
      />
    </EditorFrame>
  );
}
