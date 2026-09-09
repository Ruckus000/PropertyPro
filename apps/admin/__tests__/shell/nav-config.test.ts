import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, getActiveNavId, getPageTitle } from '@/components/shell/nav-config';

describe('nav-config', () => {
  it('has the three design groups in order', () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(['Operate', 'Customers', 'Platform']);
  });
  it('lists Rootless Communities until Task 15 folds it into Clients', () => {
    // Task 15 (spec D9) replaces this entry with a redirect to
    // `/clients?filter=rootless`; until that filter exists, the open
    // root-claim dispute queue needs a rail entry to stay reachable.
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href.includes('rootless'));
    expect(item).toBeDefined();
    expect(item?.href).toBe('/communities/rootless');
  });
  it('resolves nested paths to their section by longest prefix', () => {
    expect(getActiveNavId('/clients/12')).toBe('clients');
    expect(getActiveNavId('/inbox/44')).toBe('inbox');
    expect(getActiveNavId('/site-templates/theme-presets')).toBe('templates');
    expect(getActiveNavId('/nope')).toBeNull();
  });
  it('titles mobile screens from the active item', () => {
    expect(getPageTitle('/deletion-requests')).toBe('Deletion requests');
  });
});
