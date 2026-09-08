/**
 * Normalise a Drizzle `.execute()` result to an array of rows.
 *
 * ## Why this is not just `result.rows`
 *
 * The shape depends on the driver. With **postgres.js** — which is what this
 * repo uses — `db.execute(sql`…`)` resolves to an ARRAY of rows directly. With
 * node-postgres it resolves to a `{ rows }` object. Code written against the
 * `{ rows }` shape therefore reads `undefined` here, treats it as "no rows",
 * and reports a clean result for a query that actually returned data.
 *
 * That is not hypothetical: issue #947 records a reconciliation report that came
 * back "clean" on exactly this mistake and left a loginable orphan auth account
 * in production. A read-only audit script that silently reports nothing is worse
 * than one that crashes, because nobody re-runs it.
 *
 * Handling both shapes is deliberate rather than superstitious: it costs one
 * branch, and it makes the helper correct if the driver is ever swapped.
 *
 * Extracted from `scripts/reset-demo.ts`, which had the only correct copy.
 */
export function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (typeof result === 'object' && result !== null && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }

  return [];
}
