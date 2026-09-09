/**
 * PR #4: Next 15 robots.ts metadata route. Per-host policy.
 *
 * Three branches:
 *   1. Community public host — a community subdomain (real tenant, not
 *      reserved) OR a verified custom domain: allow indexing the public site,
 *      disallow authenticated areas.
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
import { isApexHost } from '@/lib/middleware/public-host-routes';

export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const hdrs = await headers();
  const host = hdrs.get('host');
  // `rootDomain` is REQUIRED for `source: 'custom_domain'` to be reachable at
  // all — `foreignHost()` returns null without it, so a verified custom domain
  // like `www.example.com` was previously classified as a reserved `www`
  // subdomain and served `disallow: '/'`, blocking all crawling of the
  // community's own site. Read the same way middleware does.
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'getpropertypro.com';
  const context = resolveCommunityContext({ host, rootDomain });

  // Branch 1: Community public host (subdomain or verified custom domain) —
  // allow the public site, disallow authenticated paths.
  const isCommunitySubdomain =
    context.source === 'host_subdomain' && !!context.tenantSlug && !context.isReservedSubdomain;
  const isCustomDomain = context.source === 'custom_domain';
  if (isCommunitySubdomain || isCustomDomain) {
    return {
      rules: [
        {
          userAgent: '*',
          // Phase 11b-2: page slugs are dynamic, so a fixed four-path allow
          // list would under-advertise every new page. Allow `/` and lean on
          // the disallow list below (D15).
          //
          // Deliberately NO Disallow for the search-indexing opt-out: a
          // Disallow stops the crawler fetching the page at all, so it never
          // reads the `noindex` meta tag — and an already-indexed URL then
          // persists indefinitely. The opt-out stays a sitemap/meta concern.
          allow: '/',
          disallow: ['/auth/', '/dashboard/', '/pm/', '/api/'],
        },
      ],
      sitemap: host ? `https://${host}/sitemap.xml` : undefined,
    };
  }

  // Branch 2: Reserved subdomain (pm.*, app.*, admin.*, etc.) — block all crawling.
  // These hosts serve authenticated apps; there is nothing public worth indexing
  // and URL structure should not leak to search engines.
  // `www` is NOT a third-party host: it is where production actually serves.
  // The apex 307s to `www` at the Vercel layer, so this is the host every
  // visitor and crawler lands on — and because `www` sits in
  // RESERVED_SUBDOMAINS (correctly: nobody may CLAIM it as a slug), this
  // branch was answering `Disallow: /` for the entire marketing site, with an
  // empty sitemap to match. Measured in production on 2026-09-09.
  //
  // `isApexHost` already encodes "apex or www or localhost is us" for
  // middleware; this file and sitemap.ts were the only host-policy code that
  // did not consult it. A community custom domain such as `www.example.com`
  // still fails `isApexHost` (root mismatch), so branch 1 is untouched.
  if (
    context.source === 'host_subdomain'
    && context.isReservedSubdomain
    && !isApexHost(host, rootDomain)
  ) {
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
