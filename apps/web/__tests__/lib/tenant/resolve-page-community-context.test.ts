/**
 * On a tenant subdomain the host yields only a slug; middleware resolves it to
 * an id and forwards `x-community-id` (stripped from inbound requests). Pages
 * must use that, or they show "Add a valid communityId" / the picker there.
 */
import { describe, expect, it } from 'vitest';
import { resolvePageCommunityContext } from '../../../src/lib/tenant/resolve-community-context';

const ctx = (host: string, query = '', forwarded?: string) =>
  resolvePageCommunityContext({
    searchParams: new URLSearchParams(query),
    headers: new Headers({ host, ...(forwarded ? { 'x-community-id': forwarded } : {}) }),
  });

describe('resolvePageCommunityContext', () => {
  it('tenant subdomain: uses the id middleware resolved from the slug', () => {
    expect(ctx('sunset-condos.getpropertypro.com', '', '1')).toMatchObject({
      source: 'host_subdomain',
      tenantSlug: 'sunset-condos',
      communityId: 1,
    });
  });

  it('tenant subdomain: the host still wins over a stale ?communityId=', () => {
    expect(ctx('sunset-condos.getpropertypro.com', 'communityId=2', '1').communityId).toBe(1);
  });

  it('app host: ?communityId= as before, and the header is not consulted', () => {
    expect(ctx('getpropertypro.com', 'communityId=7', '1').communityId).toBe(7);
    expect(ctx('getpropertypro.com', '', '1').communityId).toBeNull();
  });

  it('tenant subdomain with no forwarded id (unknown slug) stays unresolved', () => {
    expect(ctx('nope.getpropertypro.com').communityId).toBeNull();
    expect(ctx('nope.getpropertypro.com', '', 'not-a-number').communityId).toBeNull();
  });
});
