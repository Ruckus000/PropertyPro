import { describe, it, expect } from 'vitest';
import {
  calculateNoticePostBy,
  calculateOwnerVoteDocsDeadline,
  calculateMinutesPostingDeadline,
  getNoticeLeadDays,
} from '../../src/lib/utils/meeting-calculator';

describe('p1-16 meeting calculator', () => {
  it('uses 48-hour notice for board meetings and 14 days for annual', () => {
    expect(getNoticeLeadDays('board', 'condo_718')).toBe(2);
    expect(getNoticeLeadDays('annual', 'hoa_720')).toBe(14);
  });

  // BEHAVIOUR CHANGE (2026-08-09 feature-correctness audit): the weekend rule
  // now rolls a notice deadline BACK to the preceding Friday instead of forward
  // to Monday. Rolling forward shortened the statutory lead time — a Monday
  // 00:00 board meeting was given a post-by of the meeting's own start instant,
  // i.e. zero hours of notice. This case previously expected 2026-03-09
  // (Monday), which was two days LATE against the 14-day requirement.
  it('handles DST spring-forward subtraction without invalid timestamps', () => {
    const meeting = new Date('2026-03-22T01:30:00-04:00');
    const postBy = calculateNoticePostBy(meeting, 'annual', 'condo_718');
    expect(Number.isNaN(postBy.getTime())).toBe(false);
    expect(postBy.toISOString().startsWith('2026-03-06')).toBe(true);
    expect(meeting.getTime() - postBy.getTime()).toBeGreaterThanOrEqual(14 * 24 * 60 * 60 * 1000);
  });

  it('handles DST fall-back subtraction cleanly', () => {
    const meeting = new Date('2026-11-15T01:30:00-05:00');
    const postBy = calculateNoticePostBy(meeting, 'board', 'condo_718');
    expect(Number.isNaN(postBy.getTime())).toBe(false);
    // 2 days before Nov 15 is Nov 13; weekend rollover may move to Monday Nov 16
    expect(postBy.toISOString().slice(0, 10) >= '2026-11-13').toBe(true);
  });

  // This case was named "applies weekend rollover forward to Monday" and used a
  // meeting whose 14-day mark (Wed 2026-01-28) never touched a weekend — so it
  // passed no matter which direction the roll went, and would not have caught
  // the original zero-notice bug or its fix. Re-pointed at a start date whose
  // deadline genuinely lands on a Sunday.
  it('rolls a post-by date that lands on a weekend BACK to a weekday', () => {
    // Sat 2026-02-14 14:00 EST minus 14 days = Sun 2026-01-31.
    const meeting = new Date('2026-02-14T14:00:00-05:00');
    const postBy = calculateNoticePostBy(meeting, 'annual', 'condo_718');
    expect(Number.isNaN(postBy.getTime())).toBe(false);

    // Weekday in the zone the rule is evaluated in (the server's — see the
    // documented timezone limitation on calculateNoticePostBy).
    const dow = postBy.getDay();
    expect(dow === 0 || dow === 6).toBe(false);

    // And the roll went backwards: still at least the statutory 14 days.
    expect(meeting.getTime() - postBy.getTime()).toBeGreaterThanOrEqual(14 * 24 * 60 * 60 * 1000);
  });

  it('reflects Florida timezone split as one-hour UTC difference for deadlines', () => {
    const easternMeeting = new Date('2026-02-11T09:00:00-05:00');
    const centralMeeting = new Date('2026-02-11T09:00:00-06:00');
    const easternPostBy = calculateNoticePostBy(easternMeeting, 'annual', 'condo_718');
    const centralPostBy = calculateNoticePostBy(centralMeeting, 'annual', 'hoa_720');
    const diffMs = Math.abs(easternPostBy.getTime() - centralPostBy.getTime());
    expect(diffMs).toBe(60 * 60 * 1000);
  });

  it('owner vote documents deadline is at least 7 days prior, rolling back off a weekend', () => {
    const meeting = new Date('2026-03-15T17:00:00.000Z');
    const docsBy = calculateOwnerVoteDocsDeadline(meeting);
    expect(Number.isNaN(docsBy.getTime())).toBe(false);
    // 7 days prior to Mar 15 is Sunday Mar 8, so the deadline rolls BACK to
    // Friday Mar 6. It previously rolled forward, leaving fewer than 7 days.
    expect(docsBy.toISOString().slice(0, 10)).toBe('2026-03-06');
    expect(meeting.getTime() - docsBy.getTime()).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000);
  });

  it('minutes posting deadline is exactly meeting + 30 days', () => {
    const meeting = new Date('2026-01-08T12:00:00.000Z');
    const minutesBy = calculateMinutesPostingDeadline(meeting);
    // +30 days is Saturday Feb 7. This previously rolled forward to Monday
    // Feb 9 — 32 days, past the statutory 30-day maximum. 30 days is a ceiling
    // with no weekend exception, so no adjustment is applied at all.
    expect(minutesBy.toISOString().startsWith('2026-02-07')).toBe(true);
    expect(minutesBy.getTime() - meeting.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

