import { resolveCommunityContext } from '@propertypro/shared';

/**
 * Is `host` a community's own subdomain (`<slug>.${NEXT_PUBLIC_ROOT_DOMAIN}`)?
 *
 * On such a host middleware takes the community from the HOST and ignores
 * `?communityId=`, so a relative link to another community lands back in the
 * host's community (or, for a non-member, back on /select-community). Links
 * that switch community must go cross-host there via `buildCommunityUrl`.
 *
 * This is exactly the condition under which middleware lets the host win:
 * `resolveCommunityContext` with the root domain, `source === 'host_subdomain'`
 * and the label not reserved. It is NOT `resolvePageCommunityContext().source`,
 * which passes no root domain and so reads a `*.vercel.app` preview's first
 * label as a tenant slug, and which also reports reserved labels (`www`, `pm`)
 * as `host_subdomain` with `isReservedSubdomain: true`.
 *
 * False for the apex, `www` and other reserved labels, localhost / IPs,
 * `*.vercel.app` previews and community custom domains: there the query
 * param is honoured and relative navigation is correct.
 */
export function isCommunitySubdomainHost(
  host: string | null,
  rootDomain: string = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'getpropertypro.com',
): boolean {
  if (!host) return false;
  const context = resolveCommunityContext({ host, rootDomain });
  return context.source === 'host_subdomain' && !context.isReservedSubdomain;
}
