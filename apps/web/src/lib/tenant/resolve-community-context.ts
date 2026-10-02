import { resolveCommunityContext as resolveFromRequest } from '@propertypro/shared';
import type { ResolvedCommunityContext } from '@propertypro/shared';
import { COMMUNITY_ID_HEADER, parseForwardedCommunityId } from '@/lib/request/forwarded-headers';

export {
  resolveCommunityContext,
} from '@propertypro/shared';
export type {
  ResolveCommunityContextInput,
  CommunityContextSource,
  ResolvedCommunityContext,
} from '@propertypro/shared';

/**
 * The community an authenticated PAGE is for.
 *
 * Same resolution as `resolveCommunityContext` (host subdomain wins over
 * `?communityId=`), with one addition: on a tenant subdomain
 * (`sunset-condos.<root>`) the host yields only a slug, never an id — so every
 * page that read `context.communityId` showed "Add a valid communityId" or the
 * community picker there, including `/dashboard`. Middleware has already
 * resolved that slug to an id and forwarded it as `x-community-id` (the
 * header is stripped from inbound requests, so it is middleware's value, not
 * the client's); this uses it, for `host_subdomain` only.
 */
export function resolvePageCommunityContext(input: {
  searchParams: URLSearchParams;
  headers: Headers;
}): ResolvedCommunityContext {
  const context = resolveFromRequest({ searchParams: input.searchParams, host: input.headers.get('host') });
  if (context.communityId || context.source !== 'host_subdomain') return context;
  const forwarded = parseForwardedCommunityId(input.headers.get(COMMUNITY_ID_HEADER));
  return forwarded ? { ...context, communityId: forwarded } : context;
}
