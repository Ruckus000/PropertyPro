/**
 * PR #4: Next 15 sitemap.ts metadata route. Per-host content.
 *
 * Three branches (mirroring robots.ts):
 *   1. Community subdomain: list the community's public URLs.
 *   2. Reserved subdomain (pm.*, app.*, admin.*): empty sitemap.
 *   3. Marketing root: list the marketing pages.
 *
 * Cached via revalidate: 3600 (1 hour).
 *
 * NOTE: per-document URLs in the sitemap are deferred. The documents
 * table has no public_access boolean today; safer to omit them rather
 * than risk leaking owner-only/board-only documents.
 */
import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@propertypro/shared';

export const revalidate = 3600;

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
    return [
      { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
      { url: `${base}/transparency`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
      { url: `${base}/notices`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
      { url: `${base}/request-access`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
    ];
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
