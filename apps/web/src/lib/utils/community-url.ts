/**
 * Build the absolute URL for a community's dashboard on its own subdomain.
 *
 * The root domain is read from NEXT_PUBLIC_ROOT_DOMAIN (set per environment)
 * and falls back to `getpropertypro.com` in production defaults. In local
 * development you can set NEXT_PUBLIC_ROOT_DOMAIN=localhost:3000 and the
 * scheme will be downgraded to http:// automatically.
 */
export function buildCommunityDashboardUrl(slug: string, path: string = '/dashboard'): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'getpropertypro.com';
  const isLocal = rootDomain.startsWith('localhost') || rootDomain.startsWith('127.');
  const scheme = isLocal ? 'http' : 'https';
  return `${scheme}://${slug}.${rootDomain}${path}`;
}
