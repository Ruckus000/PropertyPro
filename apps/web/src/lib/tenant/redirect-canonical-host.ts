import { redirect } from 'next/navigation';
import { buildCommunityUrl } from '@/lib/utils/community-url';

/**
 * Deprecate path-based `(public)/[subdomain]` routes in favor of host-canonical URLs.
 */
export function redirectToCanonicalHost(slug: string, path: string = '/'): never {
  redirect(buildCommunityUrl(slug, path));
}
