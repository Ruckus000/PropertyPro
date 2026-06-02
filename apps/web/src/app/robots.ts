/**
 * PR #4: Next 15 robots.ts metadata route. Per-host policy.
 *
 * Three branches:
 *   1. Community subdomain (real tenant, not reserved): allow indexing the
 *      public-facing pages, disallow authenticated areas.
 *   2. Reserved subdomain (e.g. `pm.`, the PM dashboard host): disallow ALL
 *      indexing. The dashboard requires auth so content is protected, but
 *      indexing URL structure leaks information unnecessarily.
 *   3. Marketing root: allow most, disallow api/dashboard/pm.
 *
 * Cached via revalidate: 3600 (1 hour).
 */
import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@propertypro/shared';

export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const hdrs = await headers();
  const host = hdrs.get('host');
  const context = resolveCommunityContext({ host });

  // Branch 1: Community subdomain — allow public pages, disallow authenticated paths.
  if (context.source === 'host_subdomain' && context.tenantSlug && !context.isReservedSubdomain) {
    return {
      rules: [
        {
          userAgent: '*',
          allow: ['/', '/transparency', '/notices', '/request-access'],
          disallow: ['/auth/', '/dashboard/', '/pm/', '/api/'],
        },
      ],
      sitemap: host ? `https://${host}/sitemap.xml` : undefined,
    };
  }

  // Branch 2: Reserved subdomain (pm.*, app.*, admin.*, etc.) — block all crawling.
  // These hosts serve authenticated apps; there is nothing public worth indexing
  // and URL structure should not leak to search engines.
  if (context.source === 'host_subdomain' && context.isReservedSubdomain) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      // No sitemap reference for reserved hosts.
    };
  }

  // Branch 3: Marketing root — allow most, disallow api/dashboard/pm.
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/pm/'],
      },
    ],
    sitemap: host ? `https://${host}/sitemap.xml` : undefined,
  };
}
