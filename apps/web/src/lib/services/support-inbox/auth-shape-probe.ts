/**
 * Whether to store the authentication shape probe on a message row.
 *
 * Pure, and separate from the persistence layer for the same reason
 * `spam-scan-plan` is separate from `spam-classifier-service`: the decision is
 * worth testing on its own, and reaching it through the ingest transaction would
 * mean stubbing a query builder — a test that pins the call order of unrelated
 * queries and breaks on any innocent refactor.
 *
 * WHAT THE PROBE IS. `normalize.ts` describes the shape of the provider's
 * verdict fields — type tags, key names, array lengths, never a value — and sets
 * it only when a verdict could not be read. It exists because this reader has
 * been corrected three times by inference: the verdict columns record an
 * OUTCOME, two different payload shapes produce the outcome production shows,
 * and the only mechanism that would have captured a real payload fires on
 * `normalization_status='failed'`, which has never happened.
 */

/**
 * How many rows may carry the probe before it retires.
 *
 * It is a diagnostic, not a feature. Once the payload shape has been seen a few
 * times it has told us everything it can, and a diagnostic write left on the
 * ingest path forever is one nobody remembers to remove — so it expires on its
 * own rather than depending on somebody noticing.
 */
export const AUTH_SHAPE_PROBE_ROW_LIMIT = 20;

/**
 * The shape to store, or null.
 *
 * `countExistingProbeRows` is injected so this module needs no database. Any
 * error it throws is SWALLOWED, and that is the property that matters most: this
 * runs inside the ingest transaction, where a throw rolls the message back, the
 * route answers 429, and the provider parks a real sender's mail for 24-72
 * hours. A missing diagnostic costs nothing by comparison — the same reasoning
 * that keeps the verdicts themselves recorded but never acted on at ingest.
 */
export async function authShapeToStore(
  authShape: Record<string, unknown> | null,
  countExistingProbeRows: () => Promise<number>,
): Promise<Record<string, unknown> | null> {
  if (authShape === null) return null;
  try {
    return (await countExistingProbeRows()) < AUTH_SHAPE_PROBE_ROW_LIMIT ? authShape : null;
  } catch {
    return null;
  }
}
