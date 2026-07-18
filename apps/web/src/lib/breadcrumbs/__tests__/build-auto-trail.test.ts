import { describe, it, expect } from 'vitest';
import { buildAutoTrail } from '../build-auto-trail';

describe('buildAutoTrail', () => {
  it('returns null for the bare root and home dashboards', () => {
    expect(buildAutoTrail('/')).toBeNull();
    expect(buildAutoTrail('/dashboard')).toBeNull();
    expect(buildAutoTrail('/dashboard/apartment')).toBeNull();
    expect(buildAutoTrail('/dashboard/overview')).toBeNull();
  });

  it('builds a single leaf crumb for a top-level section', () => {
    const trail = buildAutoTrail('/announcements');
    expect(trail).toEqual({ items: [], currentLabel: 'Announcements', leafIsDynamic: false });
  });

  it('appends ?communityId= to top-level (query-scoped) crumb hrefs', () => {
    const trail = buildAutoTrail('/announcements/new', 2);
    expect(trail?.items).toEqual([
      { label: 'Announcements', href: '/announcements?communityId=2' },
    ]);
    // `new` is a known static segment → leaf stays the URL-derived label.
    expect(trail?.currentLabel).toBe('New');
    expect(trail?.leafIsDynamic).toBe(false);
  });

  it('omits the query param when no community id is provided', () => {
    const trail = buildAutoTrail('/announcements/new');
    expect(trail?.items).toEqual([{ label: 'Announcements', href: '/announcements' }]);
  });

  it('keeps /communities/[id]/... hrefs path-scoped (no ?communityId=) and strips the tenant segments', () => {
    const trail = buildAutoTrail('/communities/2/board/forum', 2);
    expect(trail?.items).toEqual([{ label: 'Board', href: '/communities/2/board' }]);
    expect(trail?.currentLabel).toBe('Forum');
    expect(trail?.leafIsDynamic).toBe(false);
  });

  it('keeps /pm/... portal hrefs path-scoped and drops the pm/dashboard roots', () => {
    const trail = buildAutoTrail('/pm/dashboard/communities', 2);
    expect(trail?.items).toEqual([]);
    expect(trail?.currentLabel).toBe('Communities');
  });

  it('flags a numeric entity leaf as dynamic and labels it #id', () => {
    const trail = buildAutoTrail('/communities/2/board/forum/123', 2);
    expect(trail?.currentLabel).toBe('#123'); // design-tokens:exempt — entity-id label, not a hex color
    expect(trail?.leafIsDynamic).toBe(true);
    // Intermediate forum crumb stays path-scoped.
    expect(trail?.items).toEqual([
      { label: 'Board', href: '/communities/2/board' },
      { label: 'Forum', href: '/communities/2/board/forum' },
    ]);
  });

  it('flags an unknown slug leaf as dynamic (so the shell can use the page h1)', () => {
    const trail = buildAutoTrail('/help/pm/managing-multiple-communities', 2);
    expect(trail?.leafIsDynamic).toBe(true);
    expect(trail?.items).toEqual([
      { label: 'Help Center', href: '/help?communityId=2' },
      { label: 'PM', href: '/help/pm?communityId=2' },
    ]);
  });
});
