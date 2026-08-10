/**
 * The §718.111(12)(g) document-posting deadline — single source of truth.
 *
 * This lives in `@propertypro/shared` because it had drifted into THREE
 * independent copies (the web calculator, `scripts/backfill-compliance-templates.ts`,
 * and `packages/db/src/seed/seed-community.ts`), and the 2026-08-09
 * feature-correctness audit fixed only the first. The other two kept writing
 * deadlines that overstated the statutory window — the backfill script against
 * real production data. Three copies of one statutory rule is how that happens,
 * so there is now one.
 *
 * Two properties matter, and both were wrong in the copies:
 *
 * 1. **No weekend adjustment.** 30 days is a statutory MAXIMUM and neither §718
 *    nor §720 grants a weekend exception. The old copies rolled a Saturday
 *    landing forward two days and a Sunday landing forward one, advertising day
 *    31 or 32 — which also let a posting made after the statutory date be
 *    scored as on-time. There is no direction a weekend rule can move a maximum
 *    without misstating it, so it is not applied.
 *
 * 2. **Exact elapsed time.** The offset is milliseconds, not a calendar-day
 *    shift. `date-fns` `addDays` (and `setUTCDate`) move the calendar day, which
 *    returns a 719-hour "30 days" across a DST transition in a local-time zone.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Default statutory posting window, in days. §718.111(12)(g). */
export const DEFAULT_POSTING_WINDOW_DAYS = 30;

export function calculatePostingDeadline(
  sourceDate: Date,
  days: number = DEFAULT_POSTING_WINDOW_DAYS,
): Date {
  return new Date(sourceDate.getTime() + days * DAY_MS);
}
