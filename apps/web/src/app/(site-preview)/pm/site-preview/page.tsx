/**
 * Authenticated, framable live-preview of a community's public site, rendered
 * with the wizard's CURRENT layout/preset SELECTION (passed as query overrides)
 * rather than the saved branding. Embedded as an iframe by the onboarding
 * wizard so PMs see the real layout react to their choices.
 *
 * Route: /pm/site-preview?communityId=X&layout=<slug>&preset=<slug>&preview=true
 *
 * The `preview=true` query param is required so the middleware relaxes the
 * frame headers (X-Frame-Options/frame-ancestors) to allow same-origin framing.
 *
 * Auth: a management role (property_manager / root_manager) in the community —
 * `hasRole(membership, PM_MANAGER_ROLES)`, which redirects rather than throwing.
 * This is NOT the same gate as the website editor: the editor routes also
 * require the `hasSiteEditor` plan feature and this page does not, so a PM on a
 * plan without it can render the preview but cannot save from the editor.
 * Renders the SAME layout component the public site uses — server-side, so the
 * server-only block renderers (SoR blocks) work with the community's real data.
 *
 * Deliberately OUTSIDE `(authenticated)`, in its own route group, because that
 * layout renders `AppShell` unconditionally — so the wizard's 490px-wide iframe
 * used to contain the whole app: top bar, search, breadcrumb trail and the
 * billing banners, in mobile-drawer mode. Route groups do not appear in URLs, so
 * `/pm/site-preview` is unchanged and middleware still protects it (`/pm` is in
 * `PROTECTED_PATH_PREFIXES`). The group has no `layout.tsx` and inherits the root
 * one, like `(public)/`: the four group layouts that do exist all exist to mount
 * `AppQueryProvider`, and nothing here calls a React Query hook — `public-site`
 * renders these same `<Layout>` components with no provider either.
 *
 * This page owes the shell nothing: it runs its own auth below, and resolves its
 * own theme, cssVars and font links further down. `(authenticated)`'s cssVars
 * were the DEFAULT theme anyway (the PM portal sends no tenant header) and this
 * page's own nested div overrode them.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import type { CommunityType } from '@propertypro/shared';
import { createPresignedDownloadUrl } from '@propertypro/db';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { hasRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { getBrandingForCommunity, getCommunityPublicInfo } from '@/lib/api/branding';
import { listThemePresetsForWizard } from '@/lib/db/theme-preset-catalog';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { visibleBlocks } from '@/lib/site/visible-blocks';
import { getLayout } from '@/components/public-site/layouts/registry';
import {
  resolvePreviewLayoutId,
  applyPresetTokensToBranding,
} from '@/lib/public-site/preview-overrides';

/**
 * Inherited from `(authenticated)/layout.tsx` until this route moved out of that
 * group; re-declared here rather than in a group layout, matching the sibling
 * `app/dev/site-preview/page.tsx`. Without it the route becomes a static-export
 * candidate and a redirect can be baked into `.next` — see that file's header.
 */
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

function asString(v: string | string[] | undefined): string | null {
  return typeof v === 'string' ? v : null;
}

export default async function SitePreviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const communityId = Number(params['communityId']);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/pm/dashboard/communities');
  }

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

  const community = await getCommunityPublicInfo(communityId);
  if (!community) {
    redirect('/pm/dashboard/communities');
  }
  const communityType = community!.communityType as CommunityType;

  const rawBranding = await getBrandingForCommunity(community!.id);

  // Apply the selected preset's tokens over the saved branding (preview only).
  const presetSlug = asString(params['preset']);
  let presetTokens = null;
  if (presetSlug) {
    const presets = await listThemePresetsForWizard();
    presetTokens = presets.find((p) => p.slug === presetSlug)?.tokens ?? null;
  }
  const previewBranding = applyPresetTokensToBranding(rawBranding, presetTokens);

  // Presign the logo (resolveTheme reads branding.logoUrl, not logoPath).
  let logoUrl: string | null = null;
  if (rawBranding?.logoPath) {
    try {
      logoUrl = await createPresignedDownloadUrl('documents', rawBranding.logoPath);
    } catch {
      // Non-fatal.
    }
  }
  const theme = resolveTheme(
    previewBranding ? { ...previewBranding, logoUrl } : { logoUrl },
    community!.name,
    communityType,
  );
  const cssVars = toCssVars(theme);
  const fontLinks = toFontLinks(theme);

  const layoutId = resolvePreviewLayoutId(rawBranding, asString(params['layout']), communityType);
  const Layout = getLayout(layoutId);
  if (!Layout) {
    redirect('/pm/dashboard/communities');
  }

  const reader = getPublicCommunityScopedReader(community!.id);
  // Scoped to the HOME page for the same reason the public renderer is: the
  // preview has to show what the public site will show, and an unfiltered read
  // would interleave a second page's sections into it.
  const homePageId = await reader.getHomePageId();
  const blocks = visibleBlocks(
    await reader.listSiteBlocks({
      includeDrafts: true,
      ...(homePageId === null ? {} : { pageId: homePageId }),
    }),
  );

  return (
    <>
      {fontLinks.map((href) => (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div style={cssVars} data-testid="site-preview-root">
        <Layout
          community={{
            id: community!.id,
            slug: community!.slug,
            name: community!.name,
            logoUrl: theme.logoUrl,
            communityType,
            city: null,
            state: null,
            timezone: 'America/New_York',
          }}
          theme={{
            primaryColor: theme.primaryColor,
            secondaryColor: theme.secondaryColor,
            accentColor: theme.accentColor,
            headingFont: theme.fontHeading,
            bodyFont: theme.fontBody,
          }}
          blocks={blocks.map((b) => ({
            id: b.id,
            blockType: b.blockType,
            blockOrder: b.blockOrder,
            content: b.content,
          }))}
        />
      </div>
    </>
  );
}
