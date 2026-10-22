import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Fixture tests for `scripts/verify-css-var-migration.sh` (a step in ci.yml's
 * Lint job). `.claude/rules/verification.md` names it the canonical guard
 * shape, and its header records the bug that made it so: the original read
 * grep's stdout through `wc -l`, so a missing search root printed PASS. The
 * script resolves its roots against the CWD, so each case runs it from a
 * temporary tree.
 */
const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '../verify-css-var-migration.sh');
let base: string;

function write(rel: string, content: string): void {
  const file = join(base, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function run(cwd: string = base) {
  const r = spawnSync('bash', [SCRIPT], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'css-var-migration-'));
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('verify-css-var-migration.sh', () => {
  it('passes on the real repo', () => {
    expect(run(resolve(dirname(SCRIPT), '..')).code).toBe(0);
  });

  it('passes (0) on a clean tree that uses the current token names', () => {
    write('apps/web/src/a.css', '.x { color: var(--interactive-primary); }\n');
    write('packages/ui/src/b.tsx', "export const s = { color: 'var(--text-primary)' };\n");
    const r = run();
    expect(r.code).toBe(0);
    expect(r.out).toContain('PASS');
  });

  it('FAILS (1) on a reintroduced deprecated variable, printing the file and count', () => {
    write('apps/web/src/a.css', '.x { color: var(--interactive-primary); }\n');
    write('packages/ui/src/b.tsx', "export const s = { color: 'var(--brand-secondary)' };\n");
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('Found 1 reference(s)');
    expect(r.out).toContain('packages/ui/src/b.tsx:1');
  });

  it('only scans .css/.ts/.tsx', () => {
    write('apps/web/src/a.css', '.x {}\n');
    write('packages/ui/README.md', 'formerly --brand-primary\n');
    expect(run().code).toBe(0);
  });

  it('REFUSES (2) when a search root is missing — the original bug printed PASS here', () => {
    write('apps/web/src/a.css', '.x {}\n');
    const r = run();
    expect(r.code).toBe(2);
    expect(r.out).toContain("search root 'packages' does not exist");
  });
});
