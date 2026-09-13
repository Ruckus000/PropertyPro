/**
 * Tests for `scripts/perf-check.ts` — specifically the report-only sweep over
 * routes that sit in no budgeted group.
 *
 * The guard's logic had been changed twice with no test, on the reasoning that
 * it calls `main()` at import and so cannot be unit-tested. That was wrong, and
 * this file is the proof: `perf-check` reads
 * `join(process.cwd(), 'apps', 'web', '.next')`, so a sandbox directory with a
 * hand-written manifest drives every branch with no refactor at all. The
 * spawn-a-guard-against-a-temp-root shape is lifted from
 * `verify-shared-side-effects.test.ts`.
 *
 * The property under test is narrow and worth stating: a route over the hard
 * budget that nobody budgeted must be REPORTED and must not FAIL the run —
 * seven such routes existed when the sweep was added, and failing on them would
 * have blocked every push until unrelated screens were fixed.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const guardScript = join(repoRoot, 'scripts', 'perf-check.ts');
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx');

/** The web group `perf-check` will resolve against a fixture manifest. */
const BUDGETED_WEB_ROUTE = '/(marketing)/page';
/** The `maintenance` group's first candidate. */
const MAINTENANCE_FIRST = '/(authenticated)/maintenance/inbox/page';
/** Declared in the `maintenance` group, but behind MAINTENANCE_FIRST. */
const DECLARED_FALLBACK = '/(authenticated)/maintenance/submit/page';

let sandbox: string | undefined;

afterEach(() => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
  sandbox = undefined;
});

/**
 * Writes a `.next` tree for both apps. Admin gets an empty-but-valid manifest so
 * the run is about `web`; a missing admin manifest is a different branch
 * (`SKIPPED`) and would muddy these assertions.
 */
function writeSandbox(webPages: Record<string, number>): string {
  const root = mkdtempSync(join(tmpdir(), 'perf-check-'));
  sandbox = root;

  for (const app of ['web', 'admin'] as const) {
    const next = join(root, 'apps', app, '.next');
    mkdirSync(join(next, 'static', 'chunks'), { recursive: true });

    const pages: Record<string, string[]> =
      app === 'admin' ? { '/(console)/dashboard/page': [] } : {};

    if (app === 'web') {
      for (const [route, kib] of Object.entries(webPages)) {
        const chunk = `static/chunks/${route.replace(/[^a-z0-9]/gi, '_')}.js`;
        writeFileSync(join(next, chunk), 'x'.repeat(kib * 1024));
        pages[route] = [chunk];
      }
    }

    writeFileSync(join(next, 'app-build-manifest.json'), JSON.stringify({ pages }));
  }

  return root;
}

function runGuard(cwd: string) {
  const result = spawnSync(tsxBin, [guardScript], { cwd, encoding: 'utf8' });
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

describe('perf-check — the unbudgeted sweep', () => {
  it('passes when every route is inside the budget', () => {
    const root = writeSandbox({ [BUDGETED_WEB_ROUTE]: 100, '/(authenticated)/settings/page': 100 });

    const { status, output } = runGuard(root);

    expect(output).toContain('unbudgeted page routes scanned: 1');
    expect(output).toContain('over hard budget: 0');
    expect(status).toBe(0);
  });

  it('REPORTS an unbudgeted route over the hard budget without failing the run', () => {
    const root = writeSandbox({ [BUDGETED_WEB_ROUTE]: 100, '/(authenticated)/settings/page': 900 });

    const { status, output } = runGuard(root);

    expect(output).toContain('UNBUDGETED route /(authenticated)/settings/page');
    expect(output).toContain('reported, not enforced');
    // The whole point: visible, but not a red build.
    expect(status).toBe(0);
    expect(output).toContain('Performance budget check passed.');
  });

  it('still FAILS when a budgeted route is over the hard budget', () => {
    const root = writeSandbox({ [BUDGETED_WEB_ROUTE]: 900 });

    const { status, output } = runGuard(root);

    expect(output).toContain('Performance budget check failed');
    expect(status).toBe(1);
  });

  it('does not report a route that a group DECLARES but did not resolve to', () => {
    // The inbox is present, so it wins `maintenance` and `submit` never resolves
    // — yet `submit` is still named in the spec, so it is not "unbudgeted".
    // Deliberately over the hard budget: if the sweep counted it, this would say so.
    const root = writeSandbox({
      [BUDGETED_WEB_ROUTE]: 100,
      [MAINTENANCE_FIRST]: 100,
      [DECLARED_FALLBACK]: 900,
    });

    const { status, output } = runGuard(root);

    expect(output).not.toContain(`UNBUDGETED route ${DECLARED_FALLBACK}`);
    expect(status).toBe(0);
  });

  /**
   * The sweep has no "examined nothing" branch of its own, deliberately — see
   * its docblock. This is the check that actually covers a broken scan, and it
   * fires one level up, before the sweep is ever reached.
   */
  it('refuses to pass when no group resolves against the manifest', () => {
    const root = writeSandbox({ '/(authenticated)/nothing-any-group-names/page': 100 });

    const { status, output } = runGuard(root);

    expect(output).toContain('could not resolve any representative routes');
    expect(status).toBe(1);
  });

  it('warns when a group falls back past its first candidate', () => {
    // `maintenance` lists the inbox first; supply only its second candidate, so
    // the group resolves but to something other than what it names first.
    const root = writeSandbox({ [BUDGETED_WEB_ROUTE]: 100, [DECLARED_FALLBACK]: 100 });

    const { output } = runGuard(root);

    expect(output).toContain('fell back to');
    expect(output).toContain(DECLARED_FALLBACK);
  });
});
