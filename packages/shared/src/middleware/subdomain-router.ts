import { isReservedSubdomain } from './reserved-subdomains';

export interface ResolveCommunityContextInput {
  searchParams?: URLSearchParams | ReadonlyURLSearchParams;
  host?: string | null;
  routeSubdomain?: string | null;
  rootDomain?: string | null;
}

export type CommunityContextSource =
  | 'community_id'
  | 'tenant_query'
  | 'route_subdomain'
  | 'host_subdomain'
  | 'custom_domain'
  | 'none';

export interface ResolvedCommunityContext {
  source: CommunityContextSource;
  communityId: number | null;
  tenantSlug: string | null;
  isReservedSubdomain: boolean;
  customDomainHost: string | null;
}

type ReadonlyURLSearchParams = Pick<URLSearchParams, 'get'>;

const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseCommunityId(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeTenantSlug(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (!TENANT_SLUG_PATTERN.test(value)) return null;
  return value;
}

function parseHostSubdomain(host: string | null | undefined): string | null {
  if (!host) return null;
  const withoutPort = host.split(':')[0]?.trim().toLowerCase() ?? '';
  if (!withoutPort) return null;

  if (withoutPort === 'localhost' || withoutPort.endsWith('.localhost')) {
    return null;
  }

  // IP addresses (e.g. 127.0.0.1) have no subdomains
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(withoutPort)) {
    return null;
  }

  const parts = withoutPort.split('.');
  if (parts.length < 3) return null;

  return parts[0] ?? null;
}

function foreignHost(host: string | null | undefined, rootDomain: string | null | undefined): string | null {
  if (!host || !rootDomain) return null;
  const h = host.split(':')[0]?.trim().toLowerCase() ?? '';
  const root = rootDomain.split(':')[0]?.trim().toLowerCase() ?? '';
  if (!h || !root) return null;
  if (h === 'localhost' || h.endsWith('.localhost')) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return null;
  if (h === root || h.endsWith(`.${root}`)) return null; // under our root → not custom
  if (!h.includes('.')) return null;
  return h;
}

export function resolveCommunityContext(
  input: ResolveCommunityContextInput,
): ResolvedCommunityContext {
  const custom = foreignHost(input.host, input.rootDomain);
  if (custom) {
    return {
      source: 'custom_domain',
      communityId: null,
      tenantSlug: null,
      isReservedSubdomain: false,
      customDomainHost: custom,
    };
  }

  const hostSubdomainRaw = normalizeTenantSlug(parseHostSubdomain(input.host));

  // Non-reserved tenant host (e.g. sunset-condos.getpropertypro.com) must win over
  // ?communityId= so a stale query param cannot pin the wrong community after a
  // cross-subdomain switch. Canonical hosts (www, reserved labels) skip this block.
  if (hostSubdomainRaw && !isReservedSubdomain(hostSubdomainRaw)) {
    return {
      source: 'host_subdomain',
      communityId: null,
      tenantSlug: hostSubdomainRaw,
      isReservedSubdomain: false,
      customDomainHost: null,
    };
  }

  const communityId = parseCommunityId(input.searchParams?.get('communityId') ?? null);
  if (communityId) {
    return {
      source: 'community_id',
      communityId,
      tenantSlug: null,
      isReservedSubdomain: false,
      customDomainHost: null,
    };
  }

  const queryTenant = normalizeTenantSlug(input.searchParams?.get('tenant') ?? null);
  if (queryTenant) {
    const reserved = isReservedSubdomain(queryTenant);
    return {
      source: 'tenant_query',
      communityId: null,
      tenantSlug: queryTenant,
      isReservedSubdomain: reserved,
      customDomainHost: null,
    };
  }

  const routeSubdomain = normalizeTenantSlug(input.routeSubdomain ?? null);
  if (routeSubdomain) {
    const reserved = isReservedSubdomain(routeSubdomain);
    return {
      source: 'route_subdomain',
      communityId: null,
      tenantSlug: routeSubdomain,
      isReservedSubdomain: reserved,
      customDomainHost: null,
    };
  }

  if (hostSubdomainRaw) {
    const reserved = isReservedSubdomain(hostSubdomainRaw);
    return {
      source: 'host_subdomain',
      communityId: null,
      tenantSlug: hostSubdomainRaw,
      isReservedSubdomain: reserved,
      customDomainHost: null,
    };
  }

  return {
    source: 'none',
    communityId: null,
    tenantSlug: null,
    isReservedSubdomain: false,
    customDomainHost: null,
  };
}
