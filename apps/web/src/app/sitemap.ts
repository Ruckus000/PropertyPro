/**
 * PR #4: Next 15 sitemap.ts metadata route. Per-host content.
 *
 * Subdomain hosts (community sites) list the community's public URLs.
 * Marketing root lists the marketing pages.
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

  if (context.source === 'host_subdomain' && context.tenantSlug && !context.isReservedSubdomain) {
    const base = `https://${host}`;
    return [
      { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
      { url: `${base}/transparency`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
      { url: `${base}/notices`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    ];
  }

  // Marketing root.
  const base = host ? `https://${host}` : 'https://getpropertypro.com';
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ];
}
