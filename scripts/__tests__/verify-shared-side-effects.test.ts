import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findViolationsInSource,
  isCheckedFile,
  resolveScanRoot,
  type Violation,
} from '../verify-shared-side-effects';

/**
 * `verify-shared-side-effects.ts` enforces the `"sideEffects": false` claim in
 * `packages/shared/package.json`.
 *
 * These tests matter more than usual because the failure the guard prevents is
 * invisible to every other signal: webpack drops an unreferenced side effect in
 * production builds only, vitest does not tree-shake, and `next build`
 * succeeds either way. If the guard silently stops detecting, nothing else
 * notices — so each detector is asserted individually against a source that
 * genuinely contains the offence, and the pure cases are asserted to stay
 * clean.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const guardScript = join(repoRoot, 'scripts', 'verify-shared-side-effects.ts');
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx');

const rules = (violations: Violation[]) => violations.map((v) => v.rule);

/**
 * Fixtures are planted in a temp directory, never inside the real
 * packages/shared/src. Other guards' subprocess tests walk that tree
 * concurrently, and a file appearing and vanishing mid-walk makes readdirSync
 * and readFileSync disagree — which surfaced as an intermittent failure in
 * verify-audit-log-trigger-overrides.test.ts, a test with nothing to do with
 * this one.
 */
let sandbox: string | undefined;

afterEach(() => {
  if (sandbox !== undefined) {
    rmSync(sandbox, { recursive: true, force: true });
    sandbox = undefined;
  }
});

describe('detects each import-time side effect', () => {
  it('flags a bare side-effect import', () => {
    const found = findViolationsInSource('probe.ts', `import './register-everything';\n`);
    expect(rules(found)).toEqual(['bare-import']);
    expect(found[0]?.line).toBe(1);
  });

  it('flags a top-level expression statement', () => {
    const found = findViolationsInSource(
      'probe.ts',
      `import { configure } from './cfg';\nconfigure({ eager: true });\n`,
    );
    expect(rules(found)).toEqual(['top-level-statement']);
    expect(found[0]?.line).toBe(2);
  });

  it('flags top-level control flow', () => {
    const found = findViolationsInSource(
      'probe.ts',
      `if (process.env['NODE_ENV'] === 'production') {\n  console.log('hi');\n}\n`,
    );
    expect(rules(found)).toEqual(['top-level-statement']);
  });

  it('flags a self-registering map written through globalThis', () => {
    const found = findViolationsInSource(
      'probe.ts',
      `export function register(k: string) {\n  (globalThis as any).__registry[k] = true;\n}\n`,
    );
    expect(rules(found)).toEqual(['global-mutation']);
  });

  it('flags prototype mutation even inside a function', () => {
    const found = findViolationsInSource(
      'probe.ts',
      `export function patch() {\n  Array.prototype.last = function () { return this[this.length - 1]; };\n}\n`,
    );
    expect(rules(found)).toEqual(['global-mutation']);
  });

  it('flags a self-registering map laundered through a const', () => {
    // The bypass: VariableStatement is a declaration, so a statement-kind
    // check waves this through while the module mutates an imported map on
    // import. This exact source passed the guard before check 4 existed.
    const found = findViolationsInSource(
      'probe.ts',
      `import { REGISTRY } from './b';\nconst _registered = REGISTRY.set('x', 1);\n`,
    );
    expect(rules(found)).toEqual(['imported-mutation']);
    expect(found[0]?.line).toBe(2);
  });

  it('flags Object.freeze applied to an IMPORTED binding', () => {
    const found = findViolationsInSource(
      'probe.ts',
      `import { REGISTRY } from './b';\nconst _frozen = Object.freeze(REGISTRY);\n`,
    );
    expect(rules(found)).toEqual(['imported-mutation']);
  });

  it('flags a class static {} block, which runs on import', () => {
    const found = findViolationsInSource(
      'probe.ts',
      `import { REGISTRY } from './b';\nexport class C { static { REGISTRY.set('y', 2); } }\n`,
    );
    expect(rules(found)).toContain('top-level-statement');
  });

  it('flags Object.defineProperty', () => {
    const found = findViolationsInSource(
      'probe.ts',
      `export const seal = () => Object.defineProperty(exports, 'x', { value: 1 });\n`,
    );
    expect(rules(found)).toContain('global-mutation');
  });
});

describe('does not flag ordinary pure module code', () => {
  it('allows imports, types, functions and schema constants', () => {
    const found = findViolationsInSource(
      'probe.ts',
      [
        `import { z } from 'zod';`,
        `export interface Foo { a: string }`,
        `export type Bar = Foo | null;`,
        `export const schema = z.object({ a: z.string() });`,
        `export function make(): Bar { return null; }`,
        `export class Thing {}`,
        `export default schema;`,
      ].join('\n'),
    );
    expect(found).toEqual([]);
  });

  it('allows a multi-line generic closed by `>;` at column 0', () => {
    // Regression: a line-based guard reads the closing `>;` of a multi-line
    // generic as a statement. `rbac-matrix.ts` and
    // `site/portfolio-template-branding.ts` both contain exactly this shape.
    const found = findViolationsInSource(
      'probe.ts',
      `export const M: Record<\n  string,\n  number\n>= {};\n`,
    );
    expect(found).toEqual([]);
  });

  it('allows a Zod schema built at module scope from an imported binding', () => {
    // z is imported and z.object() is a call on it. Check 4 must not fire:
    // this shape is in nearly every file in the package.
    const found = findViolationsInSource(
      'probe.ts',
      `import { z } from 'zod';\nexport const s = z.object({ a: z.string() });\n`,
    );
    expect(found).toEqual([]);
  });

  it('allows a mutating method on a binding the module OWNS', () => {
    // `local` is declared here, not imported, so mutating it reaches nothing
    // outside the module.
    const found = findViolationsInSource(
      'probe.ts',
      `const local = new Map<string, number>();\nconst _ = local.set('a', 1);\n`,
    );
    expect(found).toEqual([]);
  });

  it('allows Object.freeze on a value the module owns', () => {
    // Freezing your own object reaches nothing outside the module, so dropping
    // the module drops the freeze with it and nothing observable is lost.
    const found = findViolationsInSource(
      'probe.ts',
      `export const CONSTANTS = Object.freeze({ a: 1 });\n`,
    );
    expect(found).toEqual([]);
  });

  it('reads process.env without flagging it; only assignment escapes', () => {
    const read = findViolationsInSource(
      'probe.ts',
      `export const isProd = () => process.env['NODE_ENV'] === 'production';\n`,
    );
    expect(read).toEqual([]);

    const write = findViolationsInSource(
      'probe.ts',
      `export function force() { process.env['NODE_ENV'] = 'test'; }\n`,
    );
    expect(rules(write)).toEqual(['global-mutation']);
  });
});

describe('file selection', () => {
  it('skips colocated *.test.ts, whose describe() calls are top-level statements', () => {
    expect(isCheckedFile('diff.test.ts')).toBe(false);
    expect(isCheckedFile('contrast.test.tsx')).toBe(false);
    expect(isCheckedFile('types.d.ts')).toBe(false);
    expect(isCheckedFile('rbac-matrix.ts')).toBe(true);
  });
});

describe('end to end', () => {
  const runGuard = (extraArgs: string[] = []) => {
    const result = spawnSync(tsxBin, [guardScript, ...extraArgs], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return {
      status: result.status ?? -1,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    };
  };

  it('passes on the real packages/shared/src as it stands', () => {
    const { status, output } = runGuard();
    expect(output).toContain('import-time pure');
    expect(status).toBe(0);
  });

  it('exits non-zero when a side effect is present in the scanned tree', () => {
    // Proves the walker reaches real files on disk and that the process exit
    // code is wired up — not just that the pure function returns an array.
    sandbox = mkdtempSync(join(tmpdir(), 'shared-side-effects-'));
    writeFileSync(join(sandbox, 'offender.ts'), `import './boom';\n`);
    const { status, output } = runGuard(['--root', sandbox]);
    expect(status).toBe(1);
    expect(output).toContain('bare-import');
    expect(output).toContain('offender.ts');
  });

  it('defaults to packages/shared/src when --root is absent', () => {
    // The sandbox above proves the mechanism; this proves it is aimed at the
    // package the "sideEffects": false claim actually covers.
    expect(resolveScanRoot([])).toBe(join(repoRoot, 'packages/shared/src'));
    expect(resolveScanRoot(['--root', '/tmp/x'])).toBe('/tmp/x');
  });
});
