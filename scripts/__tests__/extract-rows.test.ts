/**
 * Tests for `extractRows` — the postgres.js-vs-node-postgres result-shape
 * normaliser.
 *
 * This is a four-line function and it gets a test file because of what the four
 * lines prevent. With postgres.js, `db.execute()` resolves to an ARRAY; code
 * written against the node-postgres `{ rows }` shape reads `undefined`, treats
 * it as "no rows", and reports CLEAN for a query that returned data. Issue #947
 * records exactly that: a reconciliation report that came back clean and left a
 * loginable orphan auth account in production.
 *
 * So the case that matters most is not "an array works" — it is that a
 * non-empty result can never normalise to an empty array silently.
 */
import { describe, it, expect } from 'vitest';
import { extractRows } from '../lib/extract-rows';

describe('extractRows', () => {
  it('returns a postgres.js array result unchanged — the shape this repo actually gets', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    expect(extractRows<{ id: number }>(rows)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('unwraps a node-postgres { rows } result', () => {
    expect(extractRows<{ id: number }>({ rows: [{ id: 1 }] })).toEqual([{ id: 1 }]);
  });

  it('NEVER turns a non-empty result into an empty array (the #947 failure)', () => {
    // Both driver shapes carrying one row must both yield one row. If either
    // side of this regresses, an audit script reports "clean" over real data.
    expect(extractRows([{ id: 1 }])).toHaveLength(1);
    expect(extractRows({ rows: [{ id: 1 }] })).toHaveLength(1);
  });

  it('distinguishes a genuinely empty result from an unreadable one only by returning []', () => {
    // Documented, not endorsed: callers cannot tell "no rows" from "shape I did
    // not recognise". That is why the audit script prints its denominator.
    expect(extractRows([])).toEqual([]);
    expect(extractRows({ rows: [] })).toEqual([]);
  });

  it('returns [] for shapes it cannot read, rather than throwing', () => {
    expect(extractRows(null)).toEqual([]);
    expect(extractRows(undefined)).toEqual([]);
    expect(extractRows('nope')).toEqual([]);
    expect(extractRows(42)).toEqual([]);
    expect(extractRows({})).toEqual([]);
  });

  it('returns [] when rows is present but not an array', () => {
    expect(extractRows({ rows: null })).toEqual([]);
    expect(extractRows({ rows: 'nope' })).toEqual([]);
  });
});
