// Dependency-free on purpose: route contracts import it, and
// `@/lib/finance/common` (which re-exports it) pulls server-only guards.

/**
 * True iff `value` is a `YYYY-MM-DD` string naming a real calendar date. The
 * shape check alone let `2026-02-31` through to Postgres, whose out-of-range
 * error surfaced as a 500; the round-trip through UTC rejects it (and month 13,
 * day 0, Feb 29 in a common year). Pure, so Zod contracts can `.refine` on it.
 */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
