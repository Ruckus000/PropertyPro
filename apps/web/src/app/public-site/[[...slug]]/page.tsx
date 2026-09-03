import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import { resolveTheme, toCssVars, toFontLinks, customCssOverridesToCssVars } from '@propertypro/theme';
import type { Metadata } from 'next';
import type { CommunityType } from '@propertypro/shared';
import { createPresignedDownloadUrl } from '@propertypro/db';
import {
  getBrandingForCommunity,
  getCommunityPublicInfo,
} from '@/lib/api/branding';
import { PublicSiteHeader } from '@/components/public-site/PublicSiteHeader';
import { PublicSiteFooter } from '@/components/public-site/PublicSiteFooter';
import { buildCommunityMetadata } from '@/lib/seo/community-metadata';
import { resolveLayoutId } from '@/lib/public-site/layout-resolver';
import { getLayout } from '@/components/public-site/layouts/registry';
import { hasRenderer } from '@/components/public-site/blocks/registry';
import { reportDegradedBlocks } from '@/lib/telemetry/site-block-render';
import { visibleBlocks } from '@/lib/site/visible-blocks';
import {
  getPublicCommunityScopedReader,
  type PublicNavPage,
  type PublicSitePage as PublicSitePageRow,
} from '@/lib/db/public-community-reader';
import { buildCommunityUrl } from '@/lib/utils/community-url';
import { UrgentNoticeBanner } from '@/components/public-site/UrgentNoticeBanner';
import {
  resolveFooterSettings,
  resolveSiteSettings,
} from '@/lib/site-editor/site-settings';

/**
 * Resolve community ID from middleware-injected headers.
 */
async function resolveCommunityId(): Promise<number | null> {
  const requestHeaders = await headers();
  const communityIdStr = requestHeaders.get('x-community-id');
  if (!communityIdStr) return null;

  const communityId = Number(communityIdStr);
  if (!Number.isInteger(communityId) || communityId <= 0) return null;

  return communityId;
}

/**
 * Preview mode is set by the middleware when the request carries
 * `?preview=true` on the public-site rewrite (PR #8c). In preview mode the
 * page reads draft site blocks instead of published ones and renders a
 * banner indicating the visitor is seeing unpublished content.
 */
async function resolvePreviewMode(): Promise<boolean> {
  const requestHeaders = await headers();
  return requestHeaders.get('x-preview') === 'true';
}

/**
 * Optional catch-all so the public site can own more than one URL [11b-0].
 *
 * Middleware rewrites a community subdomain's and a verified custom domain's
 * public path space here, so this route receives `/public-site` AND
 * `/public-site/<slug>`. Phase 11b-2 resolves that slug against `site_pages`.
 */
interface PublicSitePageProps {
  params: Promise<{ slug?: string[] }>;
}

/**
 * The URL path segments below the site root. `[]` is the home page.
 *
 * `params` is optional only because `generateMetadata` is invoked directly with
 * no arguments in the unit tests; Next always supplies it.
 */
async function resolveSlugSegments(
  params: PublicSitePageProps['params'] | undefined,
): Promise<string[]> {
  if (!params) return [];
  const { slug } = await params;
  return slug ?? [];
}

/**
 * Look up the page a request addresses, or 404 / 308.
 *
 * - 0 segments → the home page (identified by `getHomePageId`, exactly as
 *   before 11b-2; the home render path is unchanged).
 * - 1 segment  → `site_pages.slug`, then the retired-slug redirect table.
 * - ≥2 segments → 404. `site_pages_slug_shape_check` admits no `/` in a slug,
 *   so a nested path is not representable as a page and never will be until
 *   that constraint changes. Do NOT "support" it by falling back to the first
 *   segment: that would index every `/about/anything` as a duplicate of
 *   `/about`.
 */
/**
 * Per-request memoized page-by-slug read.
 *
 * Next invokes `generateMetadata` and the page body in the SAME request, and
 * both need the page row — so without this the sub-page path issued
 * `getPageBySlug` twice, over D20's budget of two extra reads. `cache()`
 * memoizes on the argument tuple for the lifetime of one request; note that
 * what `getPublicCommunityScopedReader` memoizes is the reader FACTORY, not
 * its method results, which is exactly why this wrapper has to exist.
 */
const getPageBySlugCached = cache(
  async (
    communityId: number,
    slug: string,
    includeDrafts: boolean,
  ): Promise<PublicSitePageRow | null> =>
    getPublicCommunityScopedReader(communityId).getPageBySlug(slug, { includeDrafts }),
);

async function resolveRequestedPage(
  communityId: number,
  reader: ReturnType<typeof getPublicCommunityScopedReader>,
  segments: string[],
  isPreview: boolean,
): Promise<{ pageId: number | null; page: PublicSitePageRow | null }> {
  if (segments.length === 0) {
    return { pageId: await reader.getHomePageId(), page: null };
  }
  if (segments.length > 1) {
    notFound();
  }

  const slug = segments[0] as string;
  // `includeDrafts` is threaded to the PAGE lookup as well as the block lookup:
  // an unpublished page is a 404 to the public and visible only under preview
  // (D7), matching the anon RLS predicate on `site_pages`.
  const page = await getPageBySlugCached(communityId, slug, isPreview);
  if (page) return { pageId: page.id, page };

  // Retired slug → ONE hop, 308 permanent (D6). `resolveRedirect` returns null
  // when the target page is deleted or still a draft, so a retired slug can
  // never 308 into a 404.
  const redirectTarget = await reader.resolveRedirect(slug);
  if (redirectTarget) {
    permanentRedirect(redirectTarget.toSlug === '' ? '/' : `/${redirectTarget.toSlug}`);
  }
  notFound();
}

export async function generateMetadata(props?: PublicSitePageProps): Promise<Metadata> {
  const communityId = await resolveCommunityId();
  if (!communityId) return { title: 'PropertyPro' };
  const community = await getCommunityPublicInfo(communityId);
  if (!community) return { title: 'PropertyPro' };

  // Phase 8. Both reads are React.cache'd, so this shares the SELECTs the page
  // body issues rather than doubling them. `resolveSiteSettings` is total — a
  // community whose branding jsonb is malformed gets default metadata, not a
  // 500 on a statutory public page.
  const branding = await getBrandingForCommunity(community.id);
  const base = buildCommunityMetadata({
    id: community.id,
    slug: community.slug,
    name: community.name,
    communityType: community.communityType as 'condo_718' | 'hoa_720' | 'apartment',
    tagline: branding?.tagline,
    siteSettings: resolveSiteSettings(branding),
  });

  // Phase 11b-2 / D17 — per-page title + canonical, so every URL does not
  // inherit the home page's and read as duplicate content.
  //
  // The HOME page's metadata is returned untouched, canonical included (it has
  // none today): this route already serves every live community, and changing
  // its tags is SEO churn with no upside.
  const segments = await resolveSlugSegments(props?.params);
  if (segments.length !== 1) return base;

  const isPreview = await resolvePreviewMode();
  const page = await getPageBySlugCached(community.id, segments[0] as string, isPreview);
  // No page (404 or a retired slug about to 308) and the home page itself both
  // keep the community-level metadata.
  if (!page || page.isHome) return base;

  return {
    ...base,
    title: `${page.name} · ${community.name}`,
    alternates: { ...base.alternates, canonical: await resolvePageCanonical(community.slug, page.slug) },
  };
}

/**
 * The canonical URL for a sub-page, on the host the visitor actually used.
 *
 * NOT `buildCommunityUrl`, which hardcodes `<slug>.<root domain>`. A verified
 * custom domain is a first-class public host as of 11b-0/11b-2 — `sitemap.ts`
 * advertises `https://<custom domain>/<slug>` for the very same page — so a
 * slug-derived canonical would tell crawlers every sub-page's real home is a
 * different origin, while the home page (which emits no canonical) stays
 * self-canonical on the custom domain. Contradictory signals on the host the
 * association actually paid for.
 *
 * Falls back to `buildCommunityUrl` only when there is no host header, which
 * in practice means a unit test or a malformed request.
 */
async function resolvePageCanonical(communitySlug: string, pageSlug: string): Promise<string> {
  const host = (await headers()).get('host');
  if (!host) return buildCommunityUrl(communitySlug, `/${pageSlug}`);
  // Local dev is the only http host; everything else is https end to end.
  const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  return `${protocol}://${host}/${pageSlug}`;
}

export default async function PublicSitePage({ params }: PublicSitePageProps) {
  const segments = await resolveSlugSegments(params);

  const communityId = await resolveCommunityId();
  const isPreview = await resolvePreviewMode();
  if (!communityId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-content-secondary">Community not found.</p>
      </div>
    );
  }

  const community = await getCommunityPublicInfo(communityId);
  if (!community) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-content-secondary">Community not found.</p>
      </div>
    );
  }

  // Phase 11b-2 — resolve WHICH page this URL addresses before doing any render
  // work. A 404 or a 308 should not first presign logo URLs.
  const reader = getPublicCommunityScopedReader(community.id);
  const { pageId, page } = await resolveRequestedPage(community.id, reader, segments, isPreview);
  const navPages: PublicNavPage[] = await reader.listNavPages();
  // Home's slug is '' — so `currentSlug` compares directly against a nav item's
  // slug on every page, home included.
  const nav = { items: navPages, currentSlug: segments[0] ?? '' };

  // Resolve theme from branding settings.
  //
  // getBrandingForCommunity returns the raw CommunityBranding shape, which
  // carries `logoPath` (a Supabase Storage object key), NOT a public URL.
  // resolveTheme reads `branding.logoUrl` — so passing the raw branding object
  // produces `theme.logoUrl === null` even when a logo is configured, and the
  // public-site header silently renders text-only. Mirror the auth-page
  // pattern (lib/auth/resolve-auth-page-branding.ts:64-78): presign the
  // download URL first, then hand resolveTheme a branding object with the
  // populated logoUrl field.
  const rawBranding = await getBrandingForCommunity(community.id);
  let logoUrl: string | null = null;
  if (rawBranding?.logoPath) {
    try {
      logoUrl = await createPresignedDownloadUrl('documents', rawBranding.logoPath);
    } catch {
      // Non-fatal — render the page without a logo rather than crash.
    }
  }
  const branding = rawBranding ? { ...rawBranding, logoUrl } : null;
  // The public-site header prefers the wordmark site logo (≤600×180, aspect
  // preserved) over the square avatar logo. resolveTheme still reads the square
  // logoUrl for non-header contexts; the header logo is threaded separately.
  let siteLogoUrl: string | null = null;
  if (rawBranding?.siteLogoPath) {
    try {
      siteLogoUrl = await createPresignedDownloadUrl('documents', rawBranding.siteLogoPath);
    } catch {
      // Non-fatal — fall back to the square logo / text.
    }
  }
  const theme = resolveTheme(
    branding,
    community.name,
    community.communityType as CommunityType,
  );
  const headerLogoUrl = siteLogoUrl ?? theme.logoUrl;
  // PR #11 — Pro+ custom CSS overrides win over the resolved theme. The
  // helper is defensive (skips bad hex / non-allowlisted fonts) and emits only
  // validated token CSS variables, never raw CSS.
  const cssVars = {
    ...toCssVars(theme),
    ...customCssOverridesToCssVars(rawBranding?.customCssOverrides),
  };
  const fontLinks = toFontLinks(theme);

  // PR #9d — JSX template render branch retired. Community public sites
  // now render exclusively through the block-model layout registry.
  // Layout-registry render path (PR #1b)
  const layoutId = resolveLayoutId(branding, community.communityType as CommunityType);
  const Layout = getLayout(layoutId);

  if (Layout) {
    // Phase 11b: scope the read to the RESOLVED page.
    //
    // Without this filter every other page's sections would render inline here,
    // interleaved by `block_order`. Null means the community has no page row at
    // all (0046's backfill skipped it because it has no site content), in which
    // case the unfiltered read is the correct pre-11b behaviour — and it can only
    // happen on the home path, since a named slug had to resolve to a page row.
    const allBlocks = await reader.listSiteBlocks({
      includeDrafts: isPreview,
      ...(pageId === null ? {} : { pageId }),
    });
    // Every block renderer degrades a failed safeParse to `return null`, and
    // all three layouts skip an unknown block type silently — so a section can
    // disappear from a statutory-transparency page behind an HTTP 200 with
    // nothing to alert on. Report it once per request, from the one server-only
    // place that sees the whole list. Skipped in preview: a PM mid-edit
    // legitimately has invalid draft content.
    //
    // Phase 11b note: `blocks` is now the RESOLVED PAGE's blocks, not the whole
    // community's, so this reports per page rather than per site. That is the
    // right granularity — a degraded section belongs to the page it renders on —
    // but it means the throttle key varies by page, and a community with several
    // broken pages can emit one warning per page per hour rather than one total.
    //
    // Reported on the UNFILTERED list, deliberately: a hidden section can be
    // both malformed and hidden, and it will silently vanish from this same
    // statutory-transparency page the moment a PM unhides it. Hiding it from
    // telemetry now would just delay discovery to that later, unwitnessed
    // moment. A merely-hidden (not malformed) block never trips this check —
    // findDegradedBlocks only flags a failed schema parse or a missing
    // renderer, neither of which `hidden: true` triggers.
    if (!isPreview) {
      reportDegradedBlocks(allBlocks, hasRenderer, {
        communityId: community.id,
        communitySlug: community.slug,
      });
    }
    // Only the render path drops hidden sections — telemetry above sees every one.
    const blocks = visibleBlocks(allBlocks);
    return (
      <>
        {fontLinks.map((href) => (
          // eslint-disable-next-line @next/next/no-page-custom-font
          <link key={href} rel="stylesheet" href={href} />
        ))}
        <div style={cssVars}>
          {/*
            ONE sticky container for both banners, so they stack vertically and
            travel together. Two independent `sticky top-0` siblings would each
            stick to the same offset and the later one would paint over the
            other as soon as the page scrolled.

            The urgent notice comes first, above the preview banner and above
            the layout's own header, because an emergency notice outranks both.
            It renders null when there is no active notice — the component
            evaluates expiry itself, on every request, so a missed sweep cannot
            strand a stale banner here.
          */}
          <div className="sticky top-0 z-50">
            <UrgentNoticeBanner notice={community} />
            {isPreview && (
              <div
                role="status"
                aria-live="polite"
                data-testid="preview-banner"
                className="border-b border-status-warning-border bg-status-warning-subtle px-4 py-2 text-center text-sm font-medium text-status-warning"
              >
                Preview mode — showing unpublished drafts. Visitors see the last published version.
              </div>
            )}
          </div>
          <Layout
            community={{
              id: community.id,
              slug: community.slug,
              name: community.name,
              logoUrl: headerLogoUrl,
              communityType: community.communityType as 'condo_718' | 'hoa_720' | 'apartment',
              // city / state / timezone not yet in getCommunityPublicInfo; all FL
              // communities are America/New_York. A later PR extends the SELECT.
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
            // Phase 8. Total resolver — malformed branding yields the default
            // footer rather than throwing on a page with no feature flag in
            // front of it.
            footer={resolveFooterSettings(rawBranding)}
            nav={nav}
            // Undefined on the home path (which never loads the page row), which
            // is exactly what the layouts treat as "home". See D18.
            page={page ? { name: page.name, isHome: page.isHome } : undefined}
          />
        </div>
      </>
    );
  }

  // Legacy hardcoded fallback (preserved verbatim until all layouts ship in PR #7)
  return (
    <>
      {fontLinks.map((href) => (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div style={cssVars} className="min-h-screen flex flex-col font-body">
        {/* Same banner in the legacy fallback branch: "every page" has to mean
            every render path, not just the one that is currently reachable. */}
        <UrgentNoticeBanner notice={community} />
        {/* The page nav has to reach every render path, not just the layout
            registry one — same reasoning as the banner and the footer above. */}
        <PublicSiteHeader theme={theme} nav={nav} />

        <main id="main-content" className="flex-1">
          {/* Hero section */}
          <section className="bg-primary px-4 py-20 text-center sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <h1 className="font-heading text-4xl font-bold text-content-inverse sm:text-5xl">
                {/* D18 — a sub-page headlines with its own name, not the
                    community's; it cannot own a hero block until 11c. */}
                {page && !page.isHome ? page.name : community.name}
              </h1>
              <p className="mt-4 text-lg text-content-inverse">
                Your community portal for documents, meetings, and more.
              </p>
              <div className="mt-8">
                <a
                  href="/auth/login"
                  className="inline-flex items-center rounded-md bg-surface-card px-6 py-3 text-base font-medium text-primary shadow-e2 hover:bg-surface-hover transition-colors"
                >
                  Resident Login
                </a>
              </div>
            </div>
          </section>

          {/* Features / Quick Links */}
          <section className="bg-surface-card px-4 py-16 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-5xl">
              <h2 className="font-heading text-2xl font-semibold text-content text-center mb-10">
                Community Resources
              </h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <FeatureCard
                  title="Documents"
                  description="Access community documents, budgets, and meeting minutes."
                  icon="documents"
                />
                <FeatureCard
                  title="Meetings"
                  description="View upcoming board meetings and community events."
                  icon="meetings"
                />
                <FeatureCard
                  title="Announcements"
                  description="Stay updated with the latest community news."
                  icon="announcements"
                />
              </div>
            </div>
          </section>

          {/* CTA section */}
          <section className="bg-accent px-4 py-12 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="font-heading text-xl font-semibold text-content">
                Have questions?
              </h2>
              <p className="mt-2 text-secondary">
                Contact your community management team for assistance.
              </p>
            </div>
          </section>
        </main>

        {/* Same Phase 8 footer fields in the legacy fallback branch: "the
            footer a PM edited" has to mean every render path, not just the one
            currently reachable. */}
        <PublicSiteFooter
          communityName={community.name}
          {...resolveFooterSettings(rawBranding)}
        />
      </div>
    </>
  );
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: 'documents' | 'meetings' | 'announcements';
}) {
  const icons = {
    documents: (
      <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    meetings: (
      <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    announcements: (
      <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
  };

  return (
    <div className="rounded-md border border-edge bg-surface-card p-6 shadow-e1">
      <div className="mb-3">{icons[icon]}</div>
      <h3 className="font-heading text-lg font-semibold text-content">{title}</h3>
      <p className="mt-1 text-sm text-secondary">{description}</p>
    </div>
  );
}
