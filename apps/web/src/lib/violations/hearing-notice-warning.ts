/**
 * The violation-hearing half of the notice-window check.
 *
 * Until now the 14-day hearing notice existed **only as a `min` attribute on a
 * browser date input** (`ViolationStatusTransition.tsx`). Nothing on the server
 * looked at `hearingDate` at all — `updateViolationForCommunity` writes it
 * verbatim — so any caller that was not that one form could schedule a hearing
 * for tomorrow, and the association would find out at the hearing.
 *
 * Deliberately a *different* module from `lib/meetings/notice-warning.ts`
 * despite the identical shape. The lead times come from different places and
 * change for different reasons: a meeting's comes from §718.112(2), this one
 * from the association's own bylaws. They share the comparison
 * (`lib/compliance/notice-window.ts`) and nothing else.
 *
 * Note the citation is softer than the meetings one, because the rule is. §718
 * requires notice of a hearing but does not itself fix 14 days; 14 is what most
 * Florida condo bylaws specify, which is why this warns rather than asserts.
 */
import { noticeShortfall, type NoticeWarning } from '@/lib/compliance/notice-window';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days of notice a hearing is expected to give, per typical Florida bylaws. */
export const HEARING_NOTICE_DAYS = 14;

export const HEARING_NOTICE_WARNING_CODE = 'hearing_notice_window_missed';

/**
 * `null` when the hearing is far enough out, when no hearing date is being set,
 * or when the value does not parse.
 *
 * An unparseable date is not this function's error to raise — the contract's
 * `z.string().datetime()` already rejects it — so it declines rather than
 * inventing a warning about a value the caller never accepted.
 */
export function buildHearingNoticeWarning(params: {
  hearingDate: Date | string | null | undefined;
  now: Date;
}): NoticeWarning | null {
  const { hearingDate, now } = params;
  if (hearingDate === null || hearingDate === undefined) {
    return null;
  }

  const hearing = hearingDate instanceof Date ? hearingDate : new Date(hearingDate);
  if (Number.isNaN(hearing.getTime())) {
    return null;
  }

  // A whole day of slack, and not arbitrarily: `hearingDate` originates in a
  // date-only `<input type="date">` and is persisted as midnight, so it carries
  // no meaningful time of day. Comparing it to a real instant makes "14 days
  // from today" — the field's own default — read as up to 24 hours short,
  // purely because the deadline lands at midnight and `now` does not. Warning
  // on the default value would train every reviewer to ignore the warning.
  //
  // The alternative was to floor both sides to a calendar day, which means
  // reading a timezone; the process's zone is UTC on Vercel and Eastern on a
  // dev Mac, and re-introducing that host-dependence is exactly what #931
  // removed from the deadline math. Elapsed milliseconds plus a day of
  // tolerance is host-independent and errs toward silence.
  const noticeDeadline = new Date(
    hearing.getTime() - HEARING_NOTICE_DAYS * DAY_MS + DAY_MS,
  );
  const shortfall = noticeShortfall(noticeDeadline, now);
  if (!shortfall) {
    return null;
  }

  return {
    code: HEARING_NOTICE_WARNING_CODE,
    message:
      `This hearing is ${shortfall.shortfallLabel} inside the ${HEARING_NOTICE_DAYS}-day notice ` +
      `window most Florida condo bylaws require. Check your governing documents — a fine or ` +
      `suspension imposed after a short-noticed hearing can be challenged.`,
  };
}
