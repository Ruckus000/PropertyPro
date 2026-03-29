import { describe, expect, it } from 'vitest';
import { resolveCommunityContext } from '../../src/lib/tenant/resolve-community-context';

describe('resolveCommunityContext', () => {
  it('prefers communityId query parameter when present', () => {
    const result = resolveCommunityContext({
      searchParams: new URLSearchParams('communityId=42&tenant=sunset'),
      routeSubdomain: 'ignored',
      host: 'ignored.getpropertypro.com',
    });

    expect(result).toEqual({
      source: 'community_id',
      communityId: 42,
      tenantSlug: null,
      isReservedSubdomain: false,
    });
  });

  it('uses tenant query parameter in development mode style URLs', () => {
    const result = resolveCommunityContext({
      searchParams: new URLSearchParams('tenant=sunset'),
      host: 'localhost:3000',
    });

    expect(result.source).toBe('tenant_query');
    expect(result.tenantSlug).toBe('sunset');
    expect(result.isReservedSubdomain).toBe(false);
  });

  it('detects reserved tenant query values', () => {
    const result = resolveCommunityContext({
      searchParams: new URLSearchParams('tenant=admin'),
    });

    expect(result.source).toBe('tenant_query');
    expect(result.tenantSlug).toBe('admin');
    expect(result.isReservedSubdomain).toBe(true);
  });

  it('falls back to route subdomain when tenant query is absent', () => {
    const result = resolveCommunityContext({
      routeSubdomain: 'palm-shores',
      host: 'localhost:3000',
    });

    expect(result.source).toBe('route_subdomain');
    expect(result.tenantSlug).toBe('palm-shores');
  });

  it('falls back to host subdomain when query and route are absent', () => {
    const result = resolveCommunityContext({
      host: 'sunset.getpropertypro.com',
    });

    expect(result.source).toBe('host_subdomain');
    expect(result.tenantSlug).toBe('sunset');
  });

  it('returns none when no context exists', () => {
    const result = resolveCommunityContext({
      host: 'localhost:3000',
    });

    expect(result.source).toBe('none');
    expect(result.communityId).toBeNull();
    expect(result.tenantSlug).toBeNull();
  });
});
