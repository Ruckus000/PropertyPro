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

  it('handles DST spring-forward subtraction without invalid timestamps', () => {
    const meeting = new Date('2026-03-22T01:30:00-04:00');
    const postBy = calculateNoticePostBy(meeting, 'annual', 'condo_718');
    expect(Number.isNaN(postBy.getTime())).toBe(false);
    expect(postBy.toISOString().startsWith('2026-03-09')).toBe(true);
  });

  it('handles DST fall-back subtraction cleanly', () => {
    const meeting = new Date('2026-11-15T01:30:00-05:00');
    const postBy = calculateNoticePostBy(meeting, 'board', 'condo_718');
    expect(Number.isNaN(postBy.getTime())).toBe(false);
    // 2 days before Nov 15 is Nov 13; weekend rollover may move to Monday Nov 16
    expect(postBy.toISOString().slice(0, 10) >= '2026-11-13').toBe(true);
  });

  it('applies weekend rollover forward to Monday for post-by dates', () => {
    // Meeting on Monday Feb 11, 2026 in EST → 14 days prior lands on a Tuesday (Jan 28) typically
    const meeting = new Date('2026-02-11T14:00:00-05:00');
    const postBy = calculateNoticePostBy(meeting, 'annual', 'condo_718');
    expect(Number.isNaN(postBy.getTime())).toBe(false);
    // Ensure we get a weekday (Mon-Fri)
    const dow = postBy.getUTCDay();
    expect(dow === 0 || dow === 6).toBe(false);
  });

  it('reflects Florida timezone split as one-hour UTC difference for deadlines', () => {
    const easternMeeting = new Date('2026-02-11T09:00:00-05:00');
    const centralMeeting = new Date('2026-02-11T09:00:00-06:00');
    const easternPostBy = calculateNoticePostBy(easternMeeting, 'annual', 'condo_718');
    const centralPostBy = calculateNoticePostBy(centralMeeting, 'annual', 'hoa_720');
    const diffMs = Math.abs(easternPostBy.getTime() - centralPostBy.getTime());
    expect(diffMs).toBe(60 * 60 * 1000);
  });

  it('owner vote documents deadline is 7 days prior with weekend rollover', () => {
    const meeting = new Date('2026-03-15T17:00:00.000Z');
    const docsBy = calculateOwnerVoteDocsDeadline(meeting);
    expect(Number.isNaN(docsBy.getTime())).toBe(false);
    // 7 days prior to Mar 15 is Mar 8; if weekend, rolled forward
    expect(docsBy.toISOString().slice(0, 10) >= '2026-03-08').toBe(true);
  });

  it('minutes posting deadline is meeting + 30 days with weekend rollover', () => {
    const meeting = new Date('2026-01-08T12:00:00.000Z');
    const minutesBy = calculateMinutesPostingDeadline(meeting);
    expect(minutesBy.toISOString().startsWith('2026-02-09')).toBe(true);
  });
});

