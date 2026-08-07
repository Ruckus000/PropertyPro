/**
 * PR #4: Next 15 sitemap.ts metadata route. Per-host content.
 *
 * Three branches (mirroring robots.ts):
 *   1. Community public host — a community subdomain OR a verified custom
 *      domain: list the community's public URLs, one entry per published
 *      site page (Phase 11b-2), + per-document URLs for documents marked
 *      public_access=true (migration 0007).
 *   2. Reserved subdomain (pm.*, app.*, admin.*): empty sitemap.
 *   3. Marketing root: list the marketing pages.
 *
 * Cached via revalidate: 3600 (1 hour).
 *
 * Per-document URLs point at the existing AUTHENTICATED download endpoint
 * `/api/v1/documents/{id}/download`. Search engines that try to fetch will
 * see 401 — but the URL appears in the sitemap, which gives logged-in
 * residents a working link and signals to crawlers that these resources
 * exist. An unauthenticated public-document download path is a separate
 * future PR.
 */
import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@propertypro/shared';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { getBrandingForCommunity } from '@/lib/api/branding';
import { isSearchIndexingEnabled } from '@/lib/site-editor/site-settings';
import { getAllResources } from '@/lib/services/resource-article-service';

export const revalidate = 3600;

/** Per-host sitemap cap for per-document URLs. Sitemaps spec allows up to
 *  50k entries; we stay well below that and rely on the public-access opt-in
 *  to keep the list small in practice. */
const SITEMAP_DOCUMENT_LIMIT = 1000;

/** Phase 11b-2 cap on per-page sitemap entries (D16), following the
 *  SITEMAP_DOCUMENT_LIMIT precedent. */
const SITEMAP_PAGE_LIMIT = 200;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hdrs = await headers();
  const host = hdrs.get('host');
  // `rootDomain` is REQUIRED for `source: 'custom_domain'` to be reachable at
  // all — `foreignHost()` returns null without it, so a verified custom domain
  // like `www.example.com` was previously classified as a reserved `www`
  // subdomain and emitted an empty sitemap. Read the same way middleware does.
  const context = resolveCommunityContext({
    host,
    rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'getpropertypro.com',
  });
  const now = new Date();

  // Branch 1: Community public host — subdomain or verified custom domain.
  // Both serve the same public site off `https://${host}`, so they share a
  // body.
  const isCommunitySubdomain =
    context.source === 'host_subdomain' && !!context.tenantSlug && !context.isReservedSubdomain;
  const isCustomDomain = context.source === 'custom_domain';
  if (isCommunitySubdomain || isCustomDomain) {
    const base = `https://${host}`;

    // Website editor v3, Phase 8 — a community that has opted out of search
    // indexing lists nothing. Asking a crawler to index pages that carry
    // `noindex` is contradictory, and the sitemap is the one signal actively
    // soliciting a crawl.
    //
    // NOTE what is deliberately NOT done: `robots.ts` still ALLOWS these paths.
    // A robots.txt Disallow stops the crawler fetching the page at all, so it
    // never sees the `noindex` meta tag — and a URL that was already indexed
    // can persist in results indefinitely. `noindex` is what de-indexes, and
    // the crawler has to be let in to read it. Do not "tighten" this by adding
    // a Disallow branch to robots.ts.
    const communityIdForIndexing = hdrs.get('x-community-id');
    const indexingId = communityIdForIndexing ? Number(communityIdForIndexing) : NaN;
    if (Number.isInteger(indexingId) && indexingId > 0) {
      const branding = await getBrandingForCommunity(indexingId);
      if (!isSearchIndexingEnabled(branding)) return [];
    }

    // Only paths that actually RENDER on a tenant host belong here. `/` and
    // `/transparency` do; `/notices` and `/request-access` did not, and were
    // advertised to crawlers as 404s on both host types until this was fixed.
    //
    // The reason is structural, not an oversight to "fix" by re-adding them:
    // those renderers live at `app/(public)/[subdomain]/<suffix>` and need a
    // `[subdomain]` PATH segment, which a host that carries tenancy implicitly
    // never supplies. `transparency` is the one suffix with a host-native twin
    // (`app/public-transparency`), which is why it is the one that survives —
    // see HOST_NATIVE_PUBLIC_SUFFIX_ROUTES in lib/middleware/public-host-routes.ts.
    // Both slugs are reserved by `isReservedPublicSlug`, so a community cannot
    // create a page at either address either. Adding one back means building a
    // host-native renderer for it first.
    //
    // Kept as two sources deliberately: that map is request ROUTING, this list
    // is SEO inventory. Deduping them across that seam would couple the two for
    // one shared entry.
    const staticEntries: MetadataRoute.Sitemap = [
      { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
      { url: `${base}/transparency`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    ];

    // Append per-document URLs when middleware has resolved a community id.
    // The header-vs-context split mirrors what apps/web/src/app/public-site/page.tsx
    // does — context tells us we're on a community subdomain; the header gives
    // us the resolved id middleware already looked up by slug.
    const communityIdHeader = hdrs.get('x-community-id');
    const communityId = communityIdHeader ? Number(communityIdHeader) : NaN;
    if (Number.isInteger(communityId) && communityId > 0) {
      const reader = getPublicCommunityScopedReader(communityId);

      // Phase 11b-2 — one entry per published page. `in_nav` is presentation,
      // not indexability, so unlisted published pages are included (D16). The
      // reader excludes the home page; `/` is already a static entry above.
      const pages = await reader.listPublishedPagesForSitemap({ limit: SITEMAP_PAGE_LIMIT });
      const pageEntries: MetadataRoute.Sitemap = pages.map((page) => ({
        url: `${base}/${page.slug}`,
        lastModified: page.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.7,
      }));

      const docs = await reader.listPublicDocumentsForSitemap({ limit: SITEMAP_DOCUMENT_LIMIT });
      const documentEntries: MetadataRoute.Sitemap = docs.map((doc) => ({
        url: `${base}/api/v1/documents/${doc.id}/download`,
        lastModified: doc.updatedAt,
        changeFrequency: 'yearly',
        priority: 0.4,
      }));
      return [...staticEntries, ...pageEntries, ...documentEntries];
    }
    return staticEntries;
  }

  // Branch 2: Reserved subdomain (pm.*, etc.) — emit no sitemap entries.
  // robots.ts disallows crawling these hosts entirely; an empty sitemap
  // matches and avoids surfacing dashboard URL structure.
  if (context.source === 'host_subdomain' && context.isReservedSubdomain) {
    return [];
  }

  // Branch 3: Marketing root.
  const base = host ? `https://${host}` : 'https://getpropertypro.com';
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    // `/pricing` is deliberately absent: pricing is the `#pricing` fragment on
    // `/`, never a route. It was advertised here for months and resolved to a
    // 308 into a community subdomain that does not exist — a dead URL fed to
    // crawlers. Fragments do not belong in a sitemap.
    { url: `${base}/resources`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    ...getAllResources().map((article) => ({
      url: `${base}/resources/${article.slug}`,
      // The article's own updatedAt, not `now` — stamping every entry with the
      // current time tells crawlers the whole corpus changes hourly and burns
      // crawl budget on pages that did not move.
      lastModified: new Date(`${article.updatedAt.slice(0, 10)}T00:00:00Z`),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    { url: `${base}/transparency`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/legal/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/legal/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
