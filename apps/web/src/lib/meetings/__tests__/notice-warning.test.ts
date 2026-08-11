import { describe, expect, it } from 'vitest';
import {
  buildMeetingNoticeWarning,
  MEETING_NOTICE_WARNING_CODE,
} from '../notice-warning';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const NOW = new Date('2026-03-15T14:00:00.000Z');

function warn(startsAt: Date, meetingType: Parameters<typeof buildMeetingNoticeWarning>[0]['meetingType']) {
  return buildMeetingNoticeWarning({
    startsAt,
    meetingType,
    communityType: 'condo_718',
    now: NOW,
  });
}

describe('buildMeetingNoticeWarning', () => {
  it('says nothing about a board meeting more than 48 hours out', () => {
    expect(warn(new Date(NOW.getTime() + 3 * DAY), 'board')).toBeNull();
  });

  it('says nothing about an owner meeting more than 14 days out', () => {
    expect(warn(new Date(NOW.getTime() + 15 * DAY), 'annual')).toBeNull();
  });

  it('warns when a board meeting is inside its 48-hour window', () => {
    const warning = warn(new Date(NOW.getTime() + 30 * HOUR), 'board');
    expect(warning?.code).toBe(MEETING_NOTICE_WARNING_CODE);
    expect(warning?.message).toContain('48-hour notice window');
    // 48h required, 30h available → the deadline passed 18 hours ago.
    expect(warning?.message).toContain('passed 18 hours ago');
  });

  it('warns when an owner meeting is inside its 14-day window', () => {
    const warning = warn(new Date(NOW.getTime() + 4 * DAY), 'annual');
    expect(warning?.message).toContain('14-day notice window');
    expect(warning?.message).toContain('passed 10 days ago');
  });

  it('applies the 48-hour window to committee and the 14-day window to special and budget', () => {
    // The lead time is read from `getNoticeLeadDays`, not restated here — this
    // asserts the routing, so a change to the statute in one place cannot leave
    // the warning quoting the other.
    const inTwentyFourHours = new Date(NOW.getTime() + 24 * HOUR);
    expect(warn(inTwentyFourHours, 'committee')?.message).toContain('48-hour');
    expect(warn(inTwentyFourHours, 'special')?.message).toContain('14-day');
    expect(warn(inTwentyFourHours, 'budget')?.message).toContain('14-day');
  });

  it('warns for a meeting already in the past', () => {
    expect(warn(new Date(NOW.getTime() - DAY), 'board')).not.toBeNull();
  });

  it('does not warn at the exact boundary — 48 hours out is compliant', () => {
    expect(warn(new Date(NOW.getTime() + 48 * HOUR), 'board')).toBeNull();
    // One second inside it is not.
    expect(warn(new Date(NOW.getTime() + 48 * HOUR - 1000), 'board')).not.toBeNull();
  });

  it('gives the same answer for an HOA as for a condo', () => {
    // `getNoticeLeadDays` ignores community type today. Asserted so that if it
    // ever branches, this test fails and forces the message to be revisited
    // rather than silently quoting a window that no longer applies.
    const startsAt = new Date(NOW.getTime() + 24 * HOUR);
    const condo = buildMeetingNoticeWarning({
      startsAt, meetingType: 'annual', communityType: 'condo_718', now: NOW,
    });
    const hoa = buildMeetingNoticeWarning({
      startsAt, meetingType: 'annual', communityType: 'hoa_720', now: NOW,
    });
    expect(hoa).toEqual(condo);
  });

  it('never blocks — it returns advice, and no code path throws', () => {
    expect(() => warn(new Date('nonsense'), 'board')).not.toThrow();
    expect(warn(new Date('nonsense'), 'board')).toBeNull();
  });
});
