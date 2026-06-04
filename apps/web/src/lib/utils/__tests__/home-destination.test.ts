import { describe, it, expect } from 'vitest';
import { resolveHomeDestination } from '../home-destination';

describe('resolveHomeDestination', () => {
  it('sends anonymous viewers to / (middleware splits to public-site/marketing)', () => {
    expect(
      resolveHomeDestination({ isLoggedIn: false, hostname: 'sunset-condos.getpropertypro.com' }),
    ).toBe('/');
    expect(
      resolveHomeDestination({ isLoggedIn: false, hostname: 'pm.getpropertypro.com' }),
    ).toBe('/');
    expect(resolveHomeDestination({ isLoggedIn: false, hostname: 'getpropertypro.com' })).toBe('/');
  });

  it('sends logged-in PM admins on the pm. subdomain to their portfolio', () => {
    expect(
      resolveHomeDestination({ isLoggedIn: true, hostname: 'pm.getpropertypro.com' }),
    ).toBe('/pm/dashboard/communities');
  });

  it('is case-insensitive on the subdomain', () => {
    expect(
      resolveHomeDestination({ isLoggedIn: true, hostname: 'PM.getpropertypro.com' }),
    ).toBe('/pm/dashboard/communities');
  });

  it('sends logged-in viewers on a community subdomain to /dashboard', () => {
    expect(
      resolveHomeDestination({ isLoggedIn: true, hostname: 'sunset-condos.getpropertypro.com' }),
    ).toBe('/dashboard');
  });

  it('falls back to /dashboard for logged-in viewers without a pm subdomain', () => {
    // apex / www: the dashboard page self-routes to overview or select-community.
    expect(resolveHomeDestination({ isLoggedIn: true, hostname: 'getpropertypro.com' })).toBe(
      '/dashboard',
    );
    expect(resolveHomeDestination({ isLoggedIn: true, hostname: 'www.getpropertypro.com' })).toBe(
      '/dashboard',
    );
    // local dev host (no real subdomain).
    expect(resolveHomeDestination({ isLoggedIn: true, hostname: 'localhost' })).toBe('/dashboard');
  });
});
