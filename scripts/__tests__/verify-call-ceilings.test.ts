import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import {
  BASELINE_REL,
  type Baseline,
  checkCallCeilings,
  countCalls,
  loadBaseline,
  planBaselineWrite,
} from '../verify-call-ceilings';

/**
 * Unit tests for `pnpm guard:call-ceilings` (roadmap 2.6 + 2.7), in the three
 * directions `.claude/rules/verification.md` asks for: refuses when it cannot
 * check (2), fails on an injected violation (1), passes on a clean tree (0).
 */
const REPO_ROOT = resolve(__dirname, '..', '..');
const WEB = 'apps/web/src';
const ADMIN = 'apps/admin/src';

let base: string;

function write(rel: string, content: string): void {
  const file = join(base, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const SVC = `${WEB}/lib/svc.ts`;
const ROUTE = `${ADMIN}/app/api/x/route.ts`;

/** A minimal tree with one call of each rule, and its exact baseline. */
function seedTree(): Baseline {
  write(SVC, 'export function f() { const db = createUnscopedClient(); return db; }\n');
  write(ROUTE, 'export async function GET() { return scoped.query(widgets); }\n');
  return { [ROUTE]: { fullTableRead: 1 }, [SVC]: { unscoped: 1 } };
}

const errors = (): string => vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join('\n');

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'call-ceilings-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(base, { recursive: true, force: true });
});

describe('checkCallCeilings', () => {
  it('passes on the real repo and prints non-zero denominators', () => {
    const baseline = loadBaseline(join(REPO_ROOT, BASELINE_REL));
    expect(checkCallCeilings(REPO_ROOT, baseline)).toBe(0);
    const logged = vi.mocked(console.log).mock.calls.map((c) => String(c[0])).join('\n');
    const m = logged.match(/scanned (\d+) files; unscoped: (\d+) calls.*fullTableRead: (\d+) calls.*baselined files: (\d+)/);
    expect(m).not.toBeNull();
    for (const n of m!.slice(1)) expect(Number(n)).toBeGreaterThan(0);
  });

  it('passes (0) on a fixture tree exactly at its ceilings', () => {
    expect(checkCallCeilings(base, seedTree())).toBe(0);
  });

  it('FAILS (1) on an extra call in a baselined file', () => {
    const baseline = seedTree();
    write(SVC, 'export function f() { createUnscopedClient(); return createUnscopedClient(); }\n');
    expect(checkCallCeilings(base, baseline)).toBe(1);
    expect(errors()).toContain(`${SVC} [unscoped]: 2 exceeds the pinned ceiling of 1`);
  });

  it('FAILS (1) on a new file with a call', () => {
    const baseline = seedTree();
    write(`${WEB}/lib/other.ts`, 'export const g = () => scoped.query(gadgets);\n');
    expect(checkCallCeilings(base, baseline)).toBe(1);
    expect(errors()).toContain(`${WEB}/lib/other.ts [fullTableRead]: 1 call(s), and this file has no fullTableRead ceiling`);
  });

  it('FAILS (1) on a stale entry: baselined calls that are gone, or a deleted file', () => {
    const baseline = seedTree();
    baseline[`${WEB}/lib/gone.ts`] = { unscoped: 3 };
    expect(checkCallCeilings(base, baseline)).toBe(1);
    expect(errors()).toContain(`${WEB}/lib/gone.ts [unscoped]: STALE — baselined at 3 but the file now has none (file deleted)`);
  });

  it('passes with a "lower it" hint when under the ceiling', () => {
    const baseline = seedTree();
    baseline[SVC] = { unscoped: 4 };
    expect(checkCallCeilings(base, baseline)).toBe(0);
    const logged = vi.mocked(console.log).mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('lower it to 1');
  });

  it('ignores test files', () => {
    const baseline = seedTree();
    write(`${WEB}/lib/__tests__/svc.ts`, 'createUnscopedClient();\n');
    write(`${WEB}/lib/svc.test.ts`, 'createUnscopedClient();\n');
    write(`${WEB}/lib/svc.spec.tsx`, 'scoped.query(widgets);\n');
    expect(checkCallCeilings(base, baseline)).toBe(0);
  });

  it('REFUSES (2) when a scan root does not exist', () => {
    write(SVC, 'createUnscopedClient(); scoped.query(widgets);\n');
    expect(checkCallCeilings(base, {})).toBe(2);
    expect(errors()).toContain(`scan root ${ADMIN} does not exist`);
  });

  it('REFUSES (2) when a scanned file does not parse', () => {
    const baseline = seedTree();
    write(`${WEB}/lib/broken.ts`, 'export const x = (;\n');
    expect(checkCallCeilings(base, baseline)).toBe(2);
    expect(errors()).toContain('broken.ts did not parse');
  });

  it('REFUSES (2) when either rule counts zero calls', () => {
    write(SVC, 'createUnscopedClient();\n');
    write(ROUTE, 'export const x = 1;\n');
    expect(checkCallCeilings(base, { [SVC]: { unscoped: 1 } })).toBe(2);
    expect(errors()).toContain('zero fullTableRead calls counted');
  });
});

describe('countCalls', () => {
  it('does not count a call named only in a comment or a string', () => {
    const src =
      '// createUnscopedClient() here\n' +
      '/* scoped.query(widgets) */\n' +
      "const s = 'createUnscopedClient()';\n" +
      'const t = `scoped.query(widgets)`;\n';
    expect(countCalls('x.ts', src)).toEqual({ unscoped: 0, fullTableRead: 0 });
  });

  it('does not count .query(communities)', () => {
    expect(countCalls('x.ts', 'scoped.query(communities);')).toEqual({ unscoped: 0, fullTableRead: 0 });
  });

  it('counts only a single bare-identifier argument to .query', () => {
    const src =
      'scoped.query(widgets);\n' +
      'scoped.query(tables.widgets);\n' +
      'scoped.query(widgets, opts);\n' +
      'scoped.query();\n' +
      'query(widgets);\n';
    expect(countCalls('x.ts', src)).toEqual({ unscoped: 0, fullTableRead: 1 });
  });

  it('counts every createUnscopedClient call, including in TSX', () => {
    const src = 'const a = createUnscopedClient();\nexport const C = () => <p>{String(createUnscopedClient())}</p>;\n';
    expect(countCalls('x.tsx', src)).toEqual({ unscoped: 2, fullTableRead: 0 });
  });

  it('returns null for a file that does not parse', () => {
    expect(countCalls('x.ts', 'const = ;')).toBeNull();
  });
});

describe('planBaselineWrite', () => {
  const prev: Baseline = { 'a.ts': { unscoped: 3 }, 'b.ts': { fullTableRead: 1 } };

  it('allows a pure shrink (lower count, removed entry) without --force', () => {
    expect(planBaselineWrite(prev, { 'a.ts': { unscoped: 2 } }, false)).toEqual({ ok: true, growth: [] });
  });

  it('REFUSES a raised count without --force, allows it with', () => {
    const next: Baseline = { 'a.ts': { unscoped: 4 }, 'b.ts': { fullTableRead: 1 } };
    expect(planBaselineWrite(prev, next, false)).toEqual({ ok: false, growth: ['a.ts unscoped: 3 → 4'] });
    expect(planBaselineWrite(prev, next, true).ok).toBe(true);
  });

  it('REFUSES a new entry (or a new rule on an existing file) without --force', () => {
    const next: Baseline = { 'a.ts': { unscoped: 3, fullTableRead: 1 }, 'b.ts': { fullTableRead: 1 }, 'c.ts': { unscoped: 1 } };
    expect(planBaselineWrite(prev, next, false)).toEqual({
      ok: false,
      growth: ['a.ts fullTableRead: 0 → 1', 'c.ts unscoped: 0 → 1'],
    });
  });
});
