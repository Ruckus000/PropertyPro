import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { TENANT_SOURCE_HEADER } from '@/lib/request/forwarded-headers';
import { buildCommunityUrl } from '@/lib/utils/community-url';
import type { AccessibleCommunity } from './resolve-accessible-community';

/** Tenant sources where the HOST names the community, so it wins over the path. */
const HOST_TENANT_SOURCES: ReadonlySet<string> = new Set(['host_subdomain', 'custom_domain']);

/**
 * Redirect to `path` inside `match`'s community.
 *
 * On a community's own host, middleware takes the community from the host and
 * ignores the path, so `/communities/<other>/…` there renders the host's shell
 * around the other community's page and its API calls 404. A record in another
 * community is therefore opened on THAT community's subdomain — the same move
 * the sidebar's community switcher makes. Everywhere else the path is honoured,
 * so the redirect stays relative.
 */
export async function redirectIntoCommunity(
  match: AccessibleCommunity,
  path: string,
  requestCommunityId: number | null,
): Promise<never> {
  const tenantSource = (await headers()).get(TENANT_SOURCE_HEADER);
  if (
    tenantSource !== null &&
    HOST_TENANT_SOURCES.has(tenantSource) &&
    match.communityId !== requestCommunityId
  ) {
    redirect(buildCommunityUrl(match.slug, path));
  }
  redirect(path);
}
