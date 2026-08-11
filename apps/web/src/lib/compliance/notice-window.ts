/**
 * "Is this schedule already inside its notice window?" — the comparison, and
 * nothing else.
 *
 * Several features owe somebody advance notice: a board meeting owes 48 hours,
 * an owner meeting 14 days, a violation hearing 14 days per most bylaws. Those
 * are three *different* statutory rules, and they stay in their own domains —
 * `lib/meetings/notice-warning.ts` and `lib/violations/hearing-notice-warning.ts`
 * each own their lead time and their citation.
 *
 * What they share is only this: given a deadline that has already been computed
 * by whoever owns the rule, has it passed? That question has one answer, so it
 * is written once. Merging the rules themselves would produce a notice-rule
 * engine nobody asked for.
 *
 * Two properties, both deliberate:
 *
 * 1. **Exact elapsed milliseconds, no calendar arithmetic.** Same reason as
 *    `@propertypro/shared`'s `calculatePostingDeadline`: a calendar-day shift
 *    returns a 23- or 25-hour "day" across a DST transition. Nothing here reads
 *    the host's timezone, so the answer does not depend on which machine asks.
 *
 * 2. **It never decides anything.** It reports a shortfall; callers warn. No
 *    meeting or hearing is blocked on this — there is no `emergency` meeting
 *    type to escape to, and emergency board meetings are legitimate
 *    (`specs/phase-1-compliance-core/16-meeting-management.md`). A hard block
 *    would make a lawful action impossible.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * One advisory returned alongside a successful mutation.
 *
 * Structurally identical to `DocumentMutationWarning` and deliberately not
 * shared with it: documents warn about storage and category problems, notices
 * about statutory timing. They have no reason to change together. The wire
 * shape matching is the point — the client already knows how to render
 * `{ code, message }`.
 */
export interface NoticeWarning {
  code: string;
  message: string;
}

export interface NoticeShortfall {
  /** How far past the deadline we already are, rounded up to the hour. */
  shortfallHours: number;
  /** The same figure phrased for a human: `"6 hours"`, `"3 days"`. */
  shortfallLabel: string;
}

/**
 * `null` when the deadline is still ahead — the common, compliant case.
 *
 * A deadline landing exactly on `now` is NOT a shortfall: the notice can still
 * be posted at that instant, which is precisely what the statutory minimum
 * permits.
 */
export function noticeShortfall(noticeDeadline: Date, now: Date): NoticeShortfall | null {
  const elapsedMs = now.getTime() - noticeDeadline.getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return null;
  }

  const shortfallHours = Math.ceil(elapsedMs / HOUR_MS);
  return { shortfallHours, shortfallLabel: describeShortfall(elapsedMs) };
}

/**
 * Phrased in the unit a reader can act on.
 *
 * Under two days, hours — "you are 6 hours late" is actionable; "0 days" is
 * not. At two days and over, days: a 14-day owner-meeting window blown by a
 * fortnight reads as "14 days", not "336 hours".
 */
function describeShortfall(elapsedMs: number): string {
  if (elapsedMs < 2 * DAY_MS) {
    const hours = Math.ceil(elapsedMs / HOUR_MS);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  const days = Math.round(elapsedMs / DAY_MS);
  return `${days} days`;
}
