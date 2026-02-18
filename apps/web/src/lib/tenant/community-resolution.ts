// Unsafe escape hatch: tenant slug resolution must happen before tenant context exists.
import { findCommunityBySlugUnscoped } from '@propertypro/db/unsafe';
import type { CommunityType } from '@propertypro/shared';
import { resolveCommunityContext } from './resolve-community-context';

export interface ResolvedCommunityRecord {
  id: number;
  slug: string;
  name: string;
  communityType: CommunityType;
  timezone: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

export function toUrlSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      if (value[0]) {
        params.set(key, value[0]);
      }
      continue;
    }
    params.set(key, value);
  }
  return params;
}

export async function findCommunityBySlug(
  slug: string,
): Promise<ResolvedCommunityRecord | null> {
  const row = await findCommunityBySlugUnscoped(slug);
  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    communityType: row.communityType as CommunityType,
    // Use || not ?? — empty string bypasses ?? and causes toLocaleString to throw RangeError
    timezone: (typeof row.timezone === 'string' && row.timezone) ? row.timezone : 'America/New_York',
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    zipCode: row.zipCode,
  };
}

export async function resolvePublicCommunity(
  searchParams: Record<string, string | string[] | undefined>,
  routeSubdomain: string,
  host: string | null,
): Promise<ResolvedCommunityRecord | null> {
  const params = toUrlSearchParams(searchParams);
  const context = resolveCommunityContext({
    searchParams: params,
    routeSubdomain,
    host,
  });

  if (context.isReservedSubdomain) {
    return null;
  }

  const tenantSlug = context.tenantSlug;
  if (!tenantSlug) {
    return null;
  }

  return findCommunityBySlug(tenantSlug);
}
