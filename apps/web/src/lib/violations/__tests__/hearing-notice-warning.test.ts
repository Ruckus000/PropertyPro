import { describe, expect, it } from 'vitest';
import {
  buildHearingNoticeWarning,
  HEARING_NOTICE_DAYS,
  HEARING_NOTICE_WARNING_CODE,
} from '../hearing-notice-warning';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Mid-afternoon, so a midnight-anchored value could not pass by accident. */
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

  it('compares exact instants — 14 days is enough, one minute less is not', () => {
    // No day of slack any more: the hearing is a real instant in the
    // community's clock, so "14 days" means 14 days of elapsed time (#931).
    expect(buildHearingNoticeWarning({ hearingDate: hearingDaysOut(14), now: NOW })).toBeNull();
    const oneMinuteShort = new Date(hearingDaysOut(14).getTime() - 60_000);
    expect(buildHearingNoticeWarning({ hearingDate: oneMinuteShort, now: NOW })?.message)
      .toContain('1 hour inside');
  });

  it('warns about a genuinely short-noticed hearing', () => {
    const warning = buildHearingNoticeWarning({ hearingDate: hearingDaysOut(7), now: NOW });
    expect(warning?.code).toBe(HEARING_NOTICE_WARNING_CODE);
    expect(warning?.message).toContain(`${HEARING_NOTICE_DAYS}-day notice window`);
    // 7 days of notice against a 14-day expectation: a 7-day shortfall, stated
    // exactly. (It read "6" while a day of date-only slack was spent here.)
    expect(warning?.message).toContain('7 days inside');
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
