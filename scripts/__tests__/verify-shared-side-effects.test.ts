import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findViolationsInSource,
  isCheckedFile,
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
const plantedFile = join(repoRoot, 'packages', 'shared', 'src', '__guard_probe__.ts');

const rules = (violations: Violation[]) => violations.map((v) => v.rule);

afterEach(() => {
  if (existsSync(plantedFile)) rmSync(plantedFile);
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
  const runGuard = () => {
    const result = spawnSync(tsxBin, [guardScript], { cwd: repoRoot, encoding: 'utf8' });
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

  it('exits non-zero when a side effect is planted in the real tree', () => {
    // Proves the walker reaches real files and that the process exit code is
    // wired up — not just that the pure function returns an array.
    writeFileSync(plantedFile, `import './boom';\n`);
    const { status, output } = runGuard();
    expect(status).toBe(1);
    expect(output).toContain('bare-import');
    expect(output).toContain('__guard_probe__.ts');
  });
});
