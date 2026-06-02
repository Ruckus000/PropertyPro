/**
 * PR #4: Next 15 sitemap.ts metadata route. Per-host content.
 *
 * Three branches (mirroring robots.ts):
 *   1. Community subdomain: list the community's public URLs + per-document
 *      URLs for documents marked public_access=true (migration 0007).
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

export const revalidate = 3600;

/** Per-host sitemap cap for per-document URLs. Sitemaps spec allows up to
 *  50k entries; we stay well below that and rely on the public-access opt-in
 *  to keep the list small in practice. */
const SITEMAP_DOCUMENT_LIMIT = 1000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hdrs = await headers();
  const host = hdrs.get('host');
  const context = resolveCommunityContext({ host });
  const now = new Date();

  // Branch 1: Community subdomain.
  // Routes listed here match the allow list in robots.ts and the actual
  // route files under apps/web/src/app/(public)/[subdomain]/.
  if (context.source === 'host_subdomain' && context.tenantSlug && !context.isReservedSubdomain) {
    const base = `https://${host}`;
    const staticEntries: MetadataRoute.Sitemap = [
      { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
      { url: `${base}/transparency`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
      { url: `${base}/notices`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
      { url: `${base}/request-access`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
    ];

    // Append per-document URLs when middleware has resolved a community id.
    // The header-vs-context split mirrors what apps/web/src/app/public-site/page.tsx
    // does — context tells us we're on a community subdomain; the header gives
    // us the resolved id middleware already looked up by slug.
    const communityIdHeader = hdrs.get('x-community-id');
    const communityId = communityIdHeader ? Number(communityIdHeader) : NaN;
    if (Number.isInteger(communityId) && communityId > 0) {
      const reader = getPublicCommunityScopedReader(communityId);
      const docs = await reader.listPublicDocumentsForSitemap({ limit: SITEMAP_DOCUMENT_LIMIT });
      const documentEntries: MetadataRoute.Sitemap = docs.map((doc) => ({
        url: `${base}/api/v1/documents/${doc.id}/download`,
        lastModified: doc.updatedAt,
        changeFrequency: 'yearly',
        priority: 0.4,
      }));
      return [...staticEntries, ...documentEntries];
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
    { url: `${base}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ];
}
