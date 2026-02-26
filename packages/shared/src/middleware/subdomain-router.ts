import { isReservedSubdomain } from './reserved-subdomains';

export interface ResolveCommunityContextInput {
  searchParams?: URLSearchParams | ReadonlyURLSearchParams;
  host?: string | null;
  routeSubdomain?: string | null;
}

export type CommunityContextSource =
  | 'community_id'
  | 'tenant_query'
  | 'route_subdomain'
  | 'host_subdomain'
  | 'none';

export interface ResolvedCommunityContext {
  source: CommunityContextSource;
  communityId: number | null;
  tenantSlug: string | null;
  isReservedSubdomain: boolean;
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

export function resolveCommunityContext(
  input: ResolveCommunityContextInput,
): ResolvedCommunityContext {
  const communityId = parseCommunityId(input.searchParams?.get('communityId') ?? null);
  if (communityId) {
    return {
      source: 'community_id',
      communityId,
      tenantSlug: null,
      isReservedSubdomain: false,
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
    };
  }

  const hostSubdomain = normalizeTenantSlug(parseHostSubdomain(input.host));
  if (hostSubdomain) {
    const reserved = isReservedSubdomain(hostSubdomain);
    return {
      source: 'host_subdomain',
      communityId: null,
      tenantSlug: hostSubdomain,
      isReservedSubdomain: reserved,
    };
  }

  return {
    source: 'none',
    communityId: null,
    tenantSlug: null,
    isReservedSubdomain: false,
  };
}
