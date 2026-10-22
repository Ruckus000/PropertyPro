import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { ROOTS, checkResponsiveGeometry } from '../verify-responsive-geometry';

/**
 * Fixture tests for `pnpm guard:responsive-geometry`: every raw `<table>`
 * outside the shared primitive is counted against a shrink-only per-file
 * ceiling, and a missing or empty search root refuses (exit 2).
 */
const PRIMITIVE = 'apps/web/src/components/ui/table.tsx';
let base: string;

function write(rel: string, content: string): void {
  const file = join(base, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** Both roots exist and hold one clean component. */
function scaffold(): void {
  for (const root of ROOTS) write(`${root}/clean.tsx`, 'export const A = () => <div />;\n');
}

const errors = () =>
  vi
    .mocked(console.error)
    .mock.calls.map((c) => String(c[0]))
    .join('\n');

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'responsive-geometry-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(base, { recursive: true, force: true });
});

describe('checkResponsiveGeometry', () => {
  it('passes on the real repo', () => {
    expect(checkResponsiveGeometry()).toBe(0);
  });

  it('passes (0) on the primitive itself and on <Table> consumers', () => {
    scaffold();
    write(PRIMITIVE, 'export const Table = () => <div className="overflow-auto"><table /></div>;\n');
    write('apps/web/src/components/finance/list.tsx', '<Table><tbody /></Table>;\n<tablefoo />;\n');
    expect(checkResponsiveGeometry(base, {})).toBe(0);
  });

  it('FAILS (1) on a hand-rolled <table>, naming file and line', () => {
    scaffold();
    write('apps/web/src/components/finance/list.tsx', 'const x = 1;\nexport const L = () => <table className="w-full"><tbody /></table>;\n');
    expect(checkResponsiveGeometry(base, {})).toBe(1);
    expect(errors()).toContain('apps/web/src/components/finance/list.tsx:2');
  });

  it('FAILS (1) on a raw table in packages/ui, and gives the packages/ui remedy', () => {
    scaffold();
    write('packages/ui/src/components/grid.tsx', 'export const G = () => (\n  <table>\n  </table>\n);\n');
    expect(checkResponsiveGeometry(base, {})).toBe(1);
    expect(errors()).toContain('packages/ui/src/components/grid.tsx:2');
    expect(errors()).toContain('Fix (packages/ui)');
  });

  it('baseline: counts every table on a line; the ceiling admits N and refuses N+1', () => {
    scaffold();
    const rel = 'apps/web/src/components/finance/list.tsx';
    write(rel, 'export const L = () => <><table /><table /></>;\n');
    expect(checkResponsiveGeometry(base, { [rel]: 2 })).toBe(0);
    expect(checkResponsiveGeometry(base, { [rel]: 1 })).toBe(1);
    expect(errors()).toContain('2 found, baseline allows 1');
  });

  it('honours the responsive-geometry:exempt escape hatch', () => {
    scaffold();
    write(
      'apps/web/src/components/print/sheet.tsx',
      '// responsive-geometry:exempt — fixed-width print sheet\nexport const S = () => <table />;\n',
    );
    expect(checkResponsiveGeometry(base, {})).toBe(0);
  });

  it('REFUSES (2) when a search root is missing', () => {
    write('apps/web/src/clean.tsx', 'export {};\n');
    expect(checkResponsiveGeometry(base, {})).toBe(2);
    expect(errors()).toContain('search root missing: packages/ui/src');
  });

  it('REFUSES (2) when the roots hold no .tsx file', () => {
    for (const root of ROOTS) write(`${root}/index.ts`, 'export {};\n');
    expect(checkResponsiveGeometry(base, {})).toBe(2);
  });
});
