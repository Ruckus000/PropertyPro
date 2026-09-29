import { notFound, redirect } from 'next/navigation';
import { buildCommunityUrl } from '@/lib/utils/community-url';

/**
 * Same shape middleware's `parsePathBasedPublicRoute` accepts. Checked here
 * too because `(public)/[subdomain]` is reachable without middleware (under a
 * matcher-excluded prefix such as `/pdfjs/…`), and the route param is
 * percent-decoded: an unchecked `evil.com%2F%23` would build
 * `https://evil.com/#.<root>` — an open redirect.
 */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Deprecate path-based `(public)/[subdomain]` routes in favor of host-canonical URLs.
 */
export function redirectToCanonicalHost(slug: string, path: string = '/'): never {
  // Hostnames are case-insensitive, so `/Sunset-Condos` keeps redirecting.
  const normalized = slug.toLowerCase();
  if (!SLUG_PATTERN.test(normalized)) {
    notFound();
  }
  redirect(buildCommunityUrl(normalized, path));
}
