import { describe, expect, it } from 'vitest';
import {
  buildHearingNoticeWarning,
  HEARING_NOTICE_DAYS,
  HEARING_NOTICE_WARNING_CODE,
} from '../hearing-notice-warning';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Mid-afternoon deliberately — midnight would hide the date-only tolerance. */
const NOW = new Date('2026-03-15T14:00:00.000Z');

function hearingDaysOut(days: number): Date {
  return new Date(NOW.getTime() + days * DAY);
}

describe('buildHearingNoticeWarning', () => {
  it('says nothing when no hearing date is being set', () => {
    expect(buildHearingNoticeWarning({ hearingDate: null, now: NOW })).toBeNull();
    expect(buildHearingNoticeWarning({ hearingDate: undefined, now: NOW })).toBeNull();
  });

  it('says nothing about a hearing comfortably outside the window', () => {
    expect(buildHearingNoticeWarning({ hearingDate: hearingDaysOut(30), now: NOW }))
      .toBeNull();
  });

  it('does not warn on the form default — exactly 14 days out at midnight', () => {
    // The regression this tolerance exists for. `ViolationStatusTransition`
    // defaults the field to `addDays(now, 14)` rendered as a date, which is
    // re-read as MIDNIGHT — up to 24 hours earlier than "14 days from this
    // instant". Without the day of slack the field would warn about its own
    // default value, and every reviewer would learn to ignore the warning.
    const midnightFourteenDaysOut = new Date('2026-03-29T00:00:00.000Z');
    expect(
      buildHearingNoticeWarning({ hearingDate: midnightFourteenDaysOut, now: NOW }),
    ).toBeNull();
  });

  it('warns about a genuinely short-noticed hearing', () => {
    const warning = buildHearingNoticeWarning({ hearingDate: hearingDaysOut(7), now: NOW });
    expect(warning?.code).toBe(HEARING_NOTICE_WARNING_CODE);
    expect(warning?.message).toContain(`${HEARING_NOTICE_DAYS}-day notice window`);
    // 7 days of notice against a 14-day expectation is a 7-day shortfall, and
    // the warning says 6 — the date-only tolerance, spent. That understatement
    // is the deliberate direction: it can only ever make the app warn less than
    // the truth, never claim a shortfall that is not there.
    expect(warning?.message).toContain('6 days inside');
  });

  it('warns about a hearing scheduled for tomorrow', () => {
    expect(buildHearingNoticeWarning({ hearingDate: hearingDaysOut(1), now: NOW }))
      .not.toBeNull();
  });

  it('cites the bylaws rather than the statute', () => {
    // §718 requires notice of a hearing but does not itself fix 14 days. The
    // copy must not claim otherwise — the app does not give legal advice.
    const message = buildHearingNoticeWarning({ hearingDate: hearingDaysOut(3), now: NOW })!.message;
    expect(message).toContain('bylaws');
    expect(message).toContain('governing documents');
    expect(message).not.toMatch(/§|statut/i);
  });

  it('accepts an ISO string as well as a Date — the API sends a string', () => {
    const iso = hearingDaysOut(5).toISOString();
    expect(buildHearingNoticeWarning({ hearingDate: iso, now: NOW }))
      .toEqual(buildHearingNoticeWarning({ hearingDate: hearingDaysOut(5), now: NOW }));
  });

  it('declines an unparseable date rather than warning about it', () => {
    // The contract's `z.string().datetime()` already rejected it; inventing a
    // compliance warning here would be a claim about a value nobody accepted.
    expect(buildHearingNoticeWarning({ hearingDate: 'not-a-date', now: NOW })).toBeNull();
  });
});
