/**
 * Statutory ceilings on association fines.
 *
 * §718.303(3) (condominiums) and §720.305(2) (HOAs) cap a fine at $100 per
 * violation and $1,000 in the aggregate for a continuing violation. The
 * generated hearing-notice PDF has cited both figures correctly since it was
 * written — while the API enforced neither, validating `amountCents` only as
 * "a positive integer". The document knew the cap; the code did not.
 *
 * ── Defaults, not fallbacks ──
 *
 * These apply whenever a community has set no override. That direction matters:
 * a community row created before the override keys existed is **capped**, not
 * uncapped. A design where an absent setting meant "no limit" would have every
 * pre-existing association shipping unconstrained, which is the bug this file
 * exists to close.
 *
 * ── The aggregate cap counts money, not rows ──
 *
 * §718.303(3) speaks of the aggregate for a continuing violation, so the check
 * sums every non-waived fine already attached to that violation and adds the
 * proposed one. Counting fines rather than dollars would let ten $100 fines
 * through.
 *
 * ⚠️ Continuing-violation aggregation is one of the readings in this file that
 * a lawyer should confirm. Whether the $1,000 aggregate attaches per violation
 * record, per underlying course of conduct, or per owner is exactly the sort of
 * question this project has no counsel budget to resolve — so the implementation
 * takes the narrowest defensible reading (per violation record) and makes the
 * choice visible here rather than burying it.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-04.
 */

/** §718.303(3) / §720.305(2) per-violation ceiling: $100. */
export const DEFAULT_FINE_CAP_CENTS = 100_00;

/** §718.303(3) / §720.305(2) aggregate ceiling for a continuing violation: $1,000. */
export const DEFAULT_FINE_AGGREGATE_CAP_CENTS = 1_000_00;

/**
 * A community's effective caps.
 *
 * An override is honoured only when it is a positive integer. A zero, a
 * negative, a float or a string that happens to sit in the JSONB blob falls
 * back to the statutory default — the same defensive posture as the `=== true`
 * gate reads, and for the same reason: the value comes from a JSON column with
 * no database-level type guarantee.
 */
export function resolveFineCaps(settings: unknown): {
  perFineCents: number;
  aggregateCents: number;
} {
  const record =
    typeof settings === 'object' && settings !== null
      ? (settings as Record<string, unknown>)
      : {};

  return {
    perFineCents: positiveIntOr(record['violationFineCapCents'], DEFAULT_FINE_CAP_CENTS),
    aggregateCents: positiveIntOr(
      record['violationFineAggregateCapCents'],
      DEFAULT_FINE_AGGREGATE_CAP_CENTS,
    ),
  };
}

function positiveIntOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

/** `12345` → `"$123.45"`. For error messages a board member has to act on. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
