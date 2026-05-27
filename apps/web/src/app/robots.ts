/**
 * PR #4: Next 15 robots.ts metadata route. Per-host policy.
 *
 * Subdomain hosts (community sites) allow indexing the public-facing
 * pages and disallow authenticated areas. The marketing root host
 * gets its own policy.
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

  // Community subdomain: allow public pages, disallow authenticated paths.
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

  // Marketing root (or reserved subdomain): allow everything except API.
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
