/**
 * Build the absolute URL for a path on a community's subdomain.
 *
 * The root domain is read from NEXT_PUBLIC_ROOT_DOMAIN (set per environment)
 * and falls back to `getpropertypro.com` in production defaults. In local
 * development you can set NEXT_PUBLIC_ROOT_DOMAIN=localhost:3000 and the
 * scheme will be downgraded to http:// automatically.
 */
export function buildCommunityUrl(slug: string, path: string = '/dashboard'): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'getpropertypro.com';
  const isLocal = rootDomain.startsWith('localhost') || rootDomain.startsWith('127.');
  const scheme = isLocal ? 'http' : 'https';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${scheme}://${slug}.${rootDomain}${normalizedPath}`;
}

/** Convenience: dashboard URL for a community. */
export function buildCommunityDashboardUrl(slug: string): string {
  return buildCommunityUrl(slug, '/dashboard');
}
