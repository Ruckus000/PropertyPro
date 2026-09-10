import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, NAV_PAGES, getActiveNavId, getPageTitle } from '@/components/shell/nav-config';

// Derived from this file's own location, never `process.cwd()`: the suite runs
// both from `apps/admin` and from the repo root, and a cwd-relative root
// silently resolves to nothing in one of those two.
const CONSOLE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..', 'src/app/(console)');

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
  /**
   * The defect this pins: Wave 1 shipped `/tickets`, `/health`, `/onboarding`
   * and `/billing` in the nav while Wave 3 had built none of them. An UNMATCHED
   * url renders the ROOT `not-found`, which never enters the `(console)` group,
   * so clicking one dropped the operator out of the shell entirely.
   *
   * Resolving against `(console)` rather than `src/app` is the load-bearing
   * part. A page at `app/tickets/page.tsx` — outside the group — renders with
   * NO shell, which is the same bug; a check that walked every `page.tsx` and
   * stripped `(group)` segments to derive urls would pass on it. So this
   * asserts existence and group membership in one expression.
   *
   * `join`, not `resolve`: every href starts with '/', and `resolve` would
   * treat that as an absolute path and discard the console root.
   */
  it('every nav href resolves to a page inside (console)', () => {
    expect(existsSync(CONSOLE_ROOT), `missing search root: ${CONSOLE_ROOT}`).toBe(true);
    // Anti-vacuity: a loop over an empty list passes while checking nothing.
    // A FLOOR, not an exact count — same shape as `no-admin-layout.test.ts`'s
    // `files.length > 100` and the e2e workflow's `expectedTestCount`. An exact
    // count would fail here first when a legitimate entry is added, hiding
    // whatever the missing-href assertion below actually found.
    expect(NAV_PAGES.length).toBeGreaterThanOrEqual(13);

    const missing = NAV_PAGES.filter(
      (page) => !existsSync(join(CONSOLE_ROOT, page.href, 'page.tsx')),
    ).map((page) => page.href);

    expect(missing).toEqual([]);
  });
});
