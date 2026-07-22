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

  it('treats www and apex hosts as path-deprecation targets', () => {
    expect(isApexHost('www.getpropertypro.com', 'getpropertypro.com')).toBe(true);
    expect(isApexHost('getpropertypro.com', 'getpropertypro.com')).toBe(true);
    expect(isApexHost('localhost:3000', 'localhost:3000')).toBe(true);
    expect(isApexHost('sunset-condos.getpropertypro.com', 'getpropertypro.com')).toBe(false);
  });
});
