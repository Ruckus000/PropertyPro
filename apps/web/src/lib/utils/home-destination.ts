/**
 * Resolve where the error-screen "Go home" link should point, based on the
 * viewer's auth state and the host they're on.
 *
 * The middleware already owns the `/` auth-split for community subdomains
 * (logged-in → `/dashboard`, anonymous → public-site landing) and the apex
 * domain (anonymous → marketing). The one case it does NOT cover is a
 * logged-in PM/CAM admin on the reserved `pm.` subdomain, where `/` falls
 * through to the marketing page instead of their portfolio — so we route that
 * explicitly here.
 *
 * `pm` is the only reserved subdomain with an authenticated home; the full
 * reserved-subdomain list is the source of truth at
 * `packages/shared/src/middleware/reserved-subdomains.ts`.
 */
export function resolveHomeDestination(opts: {
  isLoggedIn: boolean;
  hostname: string;
}): string {
  // Anonymous: send to `/`. Middleware rewrites this to the public-site
  // landing on a community subdomain, or the marketing page on apex/www.
  if (!opts.isLoggedIn) return '/';

  const subdomain = opts.hostname.split('.')[0]?.toLowerCase();

  // PM admins operate on pm.getpropertypro.com; their home is the portfolio.
  if (subdomain === 'pm') return '/pm/dashboard/communities';

  // Community subdomain → role dashboard. On apex/www (no community context)
  // the dashboard page itself redirects to /dashboard/overview or
  // /select-community, so this is a safe universal entry for everyone else.
  return '/dashboard';
}
