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

/** Every directory that moved into the `(console)` group in Task 11. */
const CONSOLE_DIRS = [
  'clients',
  'communities',
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
  });

  it('the console group renders the shell behind the platform-admin gate', () => {
    const layout = readFileSync(join(APP_ROOT, '(console)/layout.tsx'), 'utf8');
    expect(layout).toContain('requireAdminPageSession');
    expect(layout).toContain('AdminShell');
    // The gate must run BEFORE any signal read: getShellSignals() goes through
    // the service-role client, which bypasses RLS.
    expect(layout.indexOf('requireAdminPageSession()')).toBeLessThan(
      layout.indexOf('getShellSignals()'),
    );
  });
});
