import { headers } from 'next/headers';
import { resolveTheme, toCssVars, toFontLinks, customCssOverridesToCssVars } from '@propertypro/theme';
import type { CommunityType } from '@propertypro/shared';
import {
  getBrandingForCommunity,
  getCommunityPublicInfo,
} from '@/lib/api/branding';
import { PublicSiteHeader } from '@/components/public-site/PublicSiteHeader';
import { PublicSiteFooter } from '@/components/public-site/PublicSiteFooter';
import { resolveFooterSettings } from '@/lib/site-editor/site-settings';

/**
 * The branded public 404 [11b-2 / D4].
 *
 * D4 lets middleware rewrite an unknown slug to this renderer WITHOUT a
 * database read, on the stated grounds that "an unknown slug on a public host
 * *should* render the branded public 404, not the app 404". Without this file
 * that was not true: `notFound()` fell through to the root
 * `apps/web/src/app/not-found.tsx`, which is outside `public-site/layout.tsx`
 * and renders PropertyPro's own eyebrow and a "Return Home" link to `/`. On an
 * association's verified custom domain, a mistyped URL showed the vendor's
 * branding on the association's domain.
 *
 * It renders the community's header, theme and footer — the same chrome as a
 * real page — so a 404 looks like part of the site it is on.
 *
 * No nav is passed: this file must not issue a query. `not-found.tsx` renders
 * on every miss, including crawler traffic and typo-hunting bots, and the nav
 * is suppressed below two pages anyway (D10). Header + footer come from reads
 * `page.tsx` already made this request and React `cache()` memoized.
 *
 * When there is no tenant context (a request that reached the renderer with no
 * `x-community-id`) it degrades to unbranded copy rather than throwing — a 404
 * handler that can 500 turns a typo into a page nobody can diagnose.
 */
export default async function PublicSiteNotFound() {
  const requestHeaders = await headers();
  const communityIdStr = requestHeaders.get('x-community-id');
  const communityId = communityIdStr ? Number(communityIdStr) : NaN;
  const community =
    Number.isInteger(communityId) && communityId > 0
      ? await getCommunityPublicInfo(communityId)
      : null;

  if (!community) {
    return (
      <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-20">
        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold text-content">Page not found</h1>
          <p className="mt-3 text-base text-content-secondary">
            The page you were looking for does not exist or has been moved.
          </p>
        </div>
      </main>
    );
  }

  const branding = await getBrandingForCommunity(community.id);
  const theme = resolveTheme(branding, community.name, community.communityType as CommunityType);
  const cssVars = {
    ...toCssVars(theme),
    ...customCssOverridesToCssVars(branding?.customCssOverrides),
  };

  return (
    <>
      {toFontLinks(theme).map((href) => (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div style={cssVars} className="flex min-h-screen flex-col font-body">
        <PublicSiteHeader theme={theme} />
        <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-20">
          <div className="mx-auto max-w-xl text-center">
            <h1 className="font-heading text-3xl font-bold text-content sm:text-4xl">
              Page not found
            </h1>
            <p className="mt-3 text-base text-content-secondary">
              We couldn&apos;t find that page on the {community.name} website. It may have been
              moved or removed.
            </p>
            <a
              href="/"
              className="mt-8 inline-flex items-center rounded-md bg-primary px-6 py-3 text-base font-medium text-content-inverse transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-content"
            >
              Back to home
            </a>
          </div>
        </main>
        <PublicSiteFooter communityName={community.name} {...resolveFooterSettings(branding)} />
      </div>
    </>
  );
}
