/**
 * Structural guard for the Task 11 cutover: the old hand-wired shell is gone
 * and every console page is inside the `(console)` route group that renders the
 * new one.
 *
 * Written as a filesystem walk rather than `grep -rl … || true`: `|| true`
 * makes a grep that FAILED (bad root, unreadable tree) indistinguishable from a
 * grep that found nothing, which is the shape that passes vacuously. The roots
 * are asserted to exist and the scanned population is asserted non-zero for the
 * same reason — see .claude/rules/verification.md.
 *
 * Paths are derived from this file's own location, not `process.cwd()`: the
 * suite runs both from `apps/admin` (`pnpm --filter @propertypro/admin exec
 * vitest run`) and from the repo root (`pnpm test apps/admin`), and a
 * cwd-relative root silently resolves to nothing in one of those two.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ADMIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_ROOT = join(ADMIN_ROOT, 'src');
const TESTS_ROOT = join(ADMIN_ROOT, '__tests__');
const APP_ROOT = join(SRC_ROOT, 'app');

/**
 * Every directory that moved into the `(console)` group in Task 11.
 *
 * `communities` is deliberately NOT listed here: Task 15 (spec D9) folded its
 * only page (`rootless`) into `/clients?filter=rootless` and turned
 * `/communities/rootless` into a redirect. A redirect renders nothing and
 * needs no session gate before it can respond, so it moved OUT of `(console)`
 * — left inside, it would pay `(console)/layout.tsx`'s
 * `requireAdminPageSession()` + `getShellSignals()` reads and paint the full
 * shell from `app/loading.tsx` before immediately navigating away, which is
 * wasted work for a page whose only job is to leave. See the dedicated
 * assertion below and `app/communities/rootless/page.tsx`.
 */
const CONSOLE_DIRS = [
  'clients',
  'dashboard',
  'deletion-requests',
  'demo',
  'inbox',
  'leads',
  'settings',
  'site-templates',
];

function walkTsFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        stack.push(full);
      } else if (/\.tsx?$/.test(entry)) {
        out.push(full);
      }
    }
  }
  return out;
}

describe('old shell is gone', () => {
  it('nothing imports AdminLayout or Sidebar any more', () => {
    expect(existsSync(SRC_ROOT), `missing search root: ${SRC_ROOT}`).toBe(true);
    expect(existsSync(TESTS_ROOT), `missing search root: ${TESTS_ROOT}`).toBe(true);

    const files = [...walkTsFiles(SRC_ROOT), ...walkTsFiles(TESTS_ROOT)];
    // Anti-vacuity: a scan that examined nothing must not pass.
    expect(files.length).toBeGreaterThan(100);

    const offenders = files
      // Exclude this file: it necessarily contains the pattern it searches for.
      .filter((file) => file !== fileURLToPath(import.meta.url))
      .filter((file) => /components\/(AdminLayout|Sidebar)['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ADMIN_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('the old shell component files are deleted', () => {
    expect(existsSync(join(SRC_ROOT, 'components/AdminLayout.tsx'))).toBe(false);
    expect(existsSync(join(SRC_ROOT, 'components/Sidebar.tsx'))).toBe(false);
  });

  it('every authenticated page lives under app/(console)', () => {
    const topLevel = readdirSync(APP_ROOT);
    expect(topLevel).toContain('(console)');

    const grouped = readdirSync(join(APP_ROOT, '(console)'));
    for (const dir of CONSOLE_DIRS) {
      expect(topLevel, `${dir} must be inside (console)`).not.toContain(dir);
      expect(grouped, `${dir} must be inside (console)`).toContain(dir);
    }

    // The one deliberate exception (see the CONSOLE_DIRS docblock): the
    // redirect-only rootless page lives OUTSIDE (console), and must not have
    // drifted back in.
    expect(grouped, 'communities must not remain in (console) — folded into Clients').not.toContain(
      'communities',
    );
    expect(
      existsSync(join(APP_ROOT, 'communities/rootless/page.tsx')),
      'the rootless redirect must exist outside (console)',
    ).toBe(true);
  });

  it('the console group renders the shell behind the platform-admin gate', () => {
    const layout = readFileSync(join(APP_ROOT, '(console)/layout.tsx'), 'utf8');
    expect(layout).toContain('requireAdminPageSession');
    expect(layout).toContain('AdminShell');
    // The gate must run BEFORE any signal read: getShellSignals() goes through
    // the service-role client, which bypasses RLS.
    //
    // `indexOf` on the raw source is vacuous: `requireAdminPageSession()` first
    // appears inside this file's own leading `AUTHZ:` docblock, so the string
    // is found long before the real call regardless of what the executable
    // code actually does. Assert adjacency of the two `const` assignments
    // instead — this only matches the two statements back-to-back in that
    // order, so reordering the awaits (or moving either one away from the
    // other) breaks the match.
    expect(layout).toMatch(
      /const session = await requireAdminPageSession\(\);\s*\n\s*const initialSignals = await getShellSignals\(\);/,
    );
  });
});
