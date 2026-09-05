import { describe, expect, it } from 'vitest';

import { analyzeSources, detectorSelfTest } from '../verify-no-date-in-raw-sql';

/**
 * Unit tests for the detector behind `pnpm guard:no-date-in-raw-sql`.
 *
 * WHY THIS FILE EXISTS. The defect the guard prevents (#1042) survived a fully
 * green 12,000-test suite because the only tests over those statements replaced
 * `execute` with a spy — the bound values never reached a driver, and one case
 * even asserted `v instanceof Date`, pinning the exact broken shape. A guard
 * shipped without tests of its own would repeat that mistake one level up: it
 * would be trusted to answer a question nobody had checked it could answer.
 *
 * The cases below are organised around the ways the detector could be wrong in
 * a direction that MATTERS — silently missing a real violation (dangerous) and
 * flagging a safe binding (noisy enough that the guard gets disabled, which is
 * the same as missing it). Per .claude/rules/verification.md, one probe does
 * not cover several mechanisms, so each gets its own case.
 */
const SQL_DECL = 'declare function sql(s: TemplateStringsArray, ...v: unknown[]): unknown;\n';

const findingsOf = (body: string) =>
  analyzeSources({ 'probe.ts': SQL_DECL + body }).findings.map((f) => f.text);

describe('the detector self-test', () => {
  it('passes in a working environment', () => {
    // If this ever fails, the guard exits 2 rather than reporting a clean tree.
    expect(detectorSelfTest()).toEqual({
      ok: true,
      detail: 'detector distinguishes Date from string and number',
    });
  });
});

describe('bindings that WOULD throw at runtime', () => {
  it('flags a Date variable', () => {
    expect(findingsOf('const d: Date = new Date();\nexport const q = sql`a ${d}`;')).toEqual(['d']);
  });

  it('flags an inline new Date()', () => {
    expect(findingsOf('export const q = sql`a ${new Date()}`;')).toEqual(['new Date()']);
  });

  it('flags a Date arriving as a function parameter — the shape the outage had', () => {
    const src = 'export function f(now: Date) { return sql`a ${now}`; }';
    expect(findingsOf(src)).toEqual(['now']);
  });

  it('flags `Date | null`, since the Date arm is the one that throws', () => {
    const src = 'export function f(d: Date | null) { return sql`a ${d}`; }';
    expect(findingsOf(src)).toEqual(['d']);
  });

  it('flags a Date returned from a call', () => {
    const src = 'declare function when(): Date;\nexport const q = sql`a ${when()}`;';
    expect(findingsOf(src)).toEqual(['when()']);
  });

  it('flags a Date reached through a property', () => {
    const src = 'declare const row: { createdAt: Date };\nexport const q = sql`a ${row.createdAt}`;';
    expect(findingsOf(src)).toEqual(['row.createdAt']);
  });

  it('still flags a Date wearing an explicit cast — the cast does not save it', () => {
    // Measured against real Postgres: `${d}::timestamptz` throws identically,
    // because the driver fails before any SQL is parsed.
    const src = 'const d = new Date();\nexport const q = sql`a ${d}::timestamptz`;';
    expect(findingsOf(src)).toEqual(['d']);
  });

  it('flags a Date inside a nested sql template', () => {
    const src = 'const d = new Date();\nexport const q = sql`a ${sql`b ${d}`}`;';
    expect(findingsOf(src)).toEqual(['d']);
  });

  it('flags every offending binding, not just the first', () => {
    const src = 'const a = new Date(), b = new Date();\nexport const q = sql`x ${a} y ${b}`;';
    expect(findingsOf(src)).toEqual(['a', 'b']);
  });

  it('flags a member-form tag, e.g. drizzle.sql`…`', () => {
    const src =
      'declare const drizzle: { sql: (s: TemplateStringsArray, ...v: unknown[]) => unknown };\n' +
      'const d = new Date();\nexport const q = drizzle.sql`a ${d}`;';
    expect(analyzeSources({ 'probe.ts': src }).findings.map((f) => f.text)).toEqual(['d']);
  });
});

describe('bindings that are SAFE, and must not be flagged', () => {
  it('ignores the .toISOString() fix', () => {
    const src = 'const d = new Date();\nexport const q = sql`a ${d.toISOString()}`;';
    expect(findingsOf(src)).toEqual([]);
  });

  it('ignores strings, numbers and booleans', () => {
    const src =
      'declare const s: string; declare const n: number; declare const b: boolean;\n' +
      'export const q = sql`a ${s} ${n} ${b}`;';
    expect(findingsOf(src)).toEqual([]);
  });

  it('ignores a template with no interpolations at all', () => {
    expect(findingsOf('export const q = sql`SELECT 1`;')).toEqual([]);
  });

  it('ignores a Date passed to something that is NOT a sql tag', () => {
    // Drizzle's query builder serialises Dates from the column type, so
    // `lt(col, date)` is correct and must stay quiet.
    const src =
      'declare function lt(a: unknown, b: unknown): unknown;\n' +
      'declare const col: unknown;\nconst d = new Date();\nexport const q = lt(col, d);';
    expect(analyzeSources({ 'probe.ts': src }).findings).toEqual([]);
  });

  it('ignores a Date in an ordinary (untagged) template literal', () => {
    const src = 'const d = new Date();\nexport const s = `a ${d}`;';
    expect(findingsOf(src)).toEqual([]);
  });
});

describe('the escape hatch', () => {
  it('suppresses a violation on the annotated line', () => {
    const src = 'const d = new Date();\nexport const q = sql`a ${d}`; // date-sql:exempt — tested';
    expect(findingsOf(src)).toEqual([]);
  });

  it('requires the em dash, so a bare marker does not silently disable the guard', () => {
    const src = 'const d = new Date();\nexport const q = sql`a ${d}`; // date-sql:exempt';
    expect(findingsOf(src)).toEqual(['d']);
  });

  it('does not leak to the following line', () => {
    const src =
      'const d = new Date();\n' +
      'export const ok = sql`a ${d}`; // date-sql:exempt — tested\n' +
      'export const bad = sql`b ${d}`;';
    expect(findingsOf(src)).toEqual(['d']);
    expect(analyzeSources({ 'probe.ts': SQL_DECL + src }).findings[0]!.line).toBe(4);
  });
});

describe('the population counters that make a clean result meaningful', () => {
  it('counts templates and interpolations, not just findings', () => {
    const src = SQL_DECL + 'declare const s: string;\nexport const q = sql`a ${s}`;\nexport const r = sql`b`;';
    const result = analyzeSources({ 'probe.ts': src });
    expect(result.templatesScanned).toBe(2);
    expect(result.interpolationsScanned).toBe(1);
    expect(result.findings).toEqual([]);
  });

  it('reports untyped interpolations separately, so an all-`any` scan is detectable', () => {
    // The guard exits 2 when every interpolation is `any` — that state means the
    // checker is not resolving types, and a clean result would be vacuous.
    const src = SQL_DECL + 'declare const x: any;\nexport const q = sql`a ${x}`;';
    const result = analyzeSources({ 'probe.ts': src });
    expect(result.interpolationsScanned).toBe(1);
    expect(result.interpolationsUnresolved).toBe(1);
    expect(result.findings).toEqual([]);
  });
});
