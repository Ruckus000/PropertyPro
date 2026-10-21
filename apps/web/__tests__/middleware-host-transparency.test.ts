import { describe, expect, it } from 'vitest';
import {
  isApexHost,
  parsePathBasedPublicRoute,
  shouldRewriteHostTransparency,
} from '@/lib/middleware/public-host-routes';

describe('public host route helpers', () => {
  it('detects host transparency paths', () => {
    expect(shouldRewriteHostTransparency('/transparency')).toBe(true);
    expect(shouldRewriteHostTransparency('/transparency/print')).toBe(true);
    expect(shouldRewriteHostTransparency('/dashboard')).toBe(false);
  });

  it('parses deprecated path-based public slug routes', () => {
    expect(parsePathBasedPublicRoute('/sunset-condos')).toEqual({
      slug: 'sunset-condos',
      path: '/',
    });
    expect(parsePathBasedPublicRoute('/sunset-condos/transparency')).toEqual({
      slug: 'sunset-condos',
      path: '/transparency',
    });
  });

  it('ignores protected app paths and reserved subdomains', () => {
    expect(parsePathBasedPublicRoute('/dashboard')).toBeNull();
    expect(parsePathBasedPublicRoute('/auth/login')).toBeNull();
    expect(parsePathBasedPublicRoute('/pm/dashboard')).toBeNull();
    expect(parsePathBasedPublicRoute('/www')).toBeNull();
  });

  it('leaves apex marketing routes alone', () => {
    // Regression: every one of these is a real page under `(marketing)/`, and
    // without MARKETING_FIRST_SEGMENTS each was read as a community slug and
    // 308'd to a subdomain that does not exist. `/transparency` shipped that
    // way and was dead in production while still linked from the footer.
    expect(parsePathBasedPublicRoute('/transparency')).toBeNull();
    expect(parsePathBasedPublicRoute('/resources')).toBeNull();
    expect(parsePathBasedPublicRoute('/contact')).toBeNull();
    expect(parsePathBasedPublicRoute('/legal')).toBeNull();
  });

  it('never reads a public page name as a community slug', () => {
    // `/notices` on the apex used to 308 to `notices.<root>`, which no community owns.
    for (const name of ['notices', 'unavailable']) {
      expect(parsePathBasedPublicRoute(`/${name}`)).toBeNull();
    }
    expect(parsePathBasedPublicRoute('/sunset-condos/notices')).toEqual({
      slug: 'sunset-condos',
      path: '/notices',
    });
  });

  it('neither redirects nor reads a slug from the retired /request-access', () => {
    // The access-request flow is gone, so `/<slug>/request-access` no longer
    // redirects to the subdomain, and the bare name stays reserved.
    expect(parsePathBasedPublicRoute('/request-access')).toBeNull();
    expect(parsePathBasedPublicRoute('/sunset-condos/request-access')).toBeNull();
  });

  it('still redirects real slug routes that share a marketing suffix', () => {
    // Only the BARE segment belongs to marketing. `/<slug>/transparency` is a
    // genuine community route and must keep redirecting to the subdomain.
    expect(parsePathBasedPublicRoute('/sunset-condos/transparency')).toEqual({
      slug: 'sunset-condos',
      path: '/transparency',
    });
  });

  it('treats www and apex hosts as path-deprecation targets', () => {
    expect(isApexHost('www.getpropertypro.com', 'getpropertypro.com')).toBe(true);
    expect(isApexHost('getpropertypro.com', 'getpropertypro.com')).toBe(true);
    expect(isApexHost('localhost:3000', 'localhost:3000')).toBe(true);
    expect(isApexHost('sunset-condos.getpropertypro.com', 'getpropertypro.com')).toBe(false);
  });
});
