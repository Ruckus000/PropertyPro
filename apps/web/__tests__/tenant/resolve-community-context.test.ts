import { describe, expect, it } from 'vitest';
import { resolveCommunityContext } from '../../src/lib/tenant/resolve-community-context';

describe('resolveCommunityContext', () => {
  it('prefers communityId query on www (reserved host cannot pin tenant from subdomain)', () => {
    const result = resolveCommunityContext({
      searchParams: new URLSearchParams('communityId=42&tenant=sunset'),
      routeSubdomain: 'ignored',
      host: 'www.getpropertypro.com',
    });

    expect(result).toEqual({
      source: 'community_id',
      communityId: 42,
      tenantSlug: null,
      isReservedSubdomain: false,
      customDomainHost: null,
    });
  });

  it('prefers non-reserved host tenant over conflicting communityId query', () => {
    const result = resolveCommunityContext({
      searchParams: new URLSearchParams('communityId=999'),
      host: 'fake.getpropertypro.com',
    });

    expect(result).toEqual({
      source: 'host_subdomain',
      communityId: null,
      tenantSlug: 'fake',
      isReservedSubdomain: false,
      customDomainHost: null,
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

  it('classifies a foreign host as a custom domain', () => {
    const result = resolveCommunityContext({ host: 'www.sunsetcondos.com', rootDomain: 'getpropertypro.com' });
    expect(result.source).toBe('custom_domain');
    expect(result.customDomainHost).toBe('www.sunsetcondos.com');
  });
  it('keeps a root-domain subdomain on the existing path', () => {
    const result = resolveCommunityContext({ host: 'sunset-condos.getpropertypro.com', rootDomain: 'getpropertypro.com' });
    expect(result.source).toBe('host_subdomain');
    expect(result.tenantSlug).toBe('sunset-condos');
  });
  it('does not treat the apex/root as a custom domain', () => {
    const result = resolveCommunityContext({ host: 'getpropertypro.com', rootDomain: 'getpropertypro.com' });
    expect(result.source).not.toBe('custom_domain');
  });
  it('lowercases the custom host', () => {
    const result = resolveCommunityContext({ host: 'WWW.Foo.com', rootDomain: 'getpropertypro.com' });
    expect(result.customDomainHost).toBe('www.foo.com');
  });
  it('returns null customDomainHost for a normal subdomain', () => {
    const result = resolveCommunityContext({ host: 'fake.getpropertypro.com', rootDomain: 'getpropertypro.com' });
    expect(result.customDomainHost).toBeNull();
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
