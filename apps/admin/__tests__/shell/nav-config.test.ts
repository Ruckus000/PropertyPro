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
  it('has no standalone Rootless Communities entry — folded into the Clients quick filter', () => {
    // Task 15 (spec D9) replaced this entry with a redirect at
    // `/communities/rootless` (outside the console shell) to
    // `/clients?filter=rootless`; the open root-claim dispute queue is now
    // reachable via the Clients rail entry + the `rootless` quick filter, so
    // the standalone rail item is gone.
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href.includes('rootless'));
    expect(item).toBeUndefined();
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
    //
    // 12, not 13: this wave folded Rootless Communities into the Clients quick
    // filter (spec D9), removing exactly one rail entry. The floor is lowered
    // deliberately and only by that one — it is NOT free slack. The sibling
    // test above ("has no standalone Rootless Communities entry") pins the
    // removal itself, so the two cannot drift apart: restoring the entry
    // reddens that test, and deleting a DIFFERENT entry reddens this one.
    expect(NAV_PAGES.length).toBeGreaterThanOrEqual(12);

    const missing = NAV_PAGES.filter(
      (page) => !existsSync(join(CONSOLE_ROOT, page.href, 'page.tsx')),
    ).map((page) => page.href);

    expect(missing).toEqual([]);
  });
});
