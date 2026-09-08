import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, getActiveNavId, getPageTitle } from '@/components/shell/nav-config';

describe('nav-config', () => {
  it('has the three design groups in order', () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(['Operate', 'Customers', 'Platform']);
  });
  it('does not list Rootless Communities (folded into Clients)', () => {
    expect(NAV_GROUPS.flatMap((g) => g.items).some((i) => i.href.includes('rootless'))).toBe(false);
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
