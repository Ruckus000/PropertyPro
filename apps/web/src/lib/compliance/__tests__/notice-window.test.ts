/**
 * The shared comparison. Everything here is instants and elapsed time — if a
 * test in this file can be made to fail by changing `TZ`, the primitive has
 * regained a timezone dependency and #931 has come back.
 */
import { describe, expect, it } from 'vitest';
import { noticeShortfall } from '../notice-window';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const NOW = new Date('2026-03-15T14:30:00.000Z');

describe('noticeShortfall', () => {
  it('returns null while the deadline is still ahead', () => {
    expect(noticeShortfall(new Date(NOW.getTime() + 1), NOW)).toBeNull();
    expect(noticeShortfall(new Date(NOW.getTime() + 30 * DAY), NOW)).toBeNull();
  });

  it('treats a deadline landing exactly on now as met, not missed', () => {
    // The statutory minimum permits posting at that instant. Reporting a
    // zero-hour shortfall would flag a compliant schedule.
    expect(noticeShortfall(NOW, NOW)).toBeNull();
  });

  it('rounds a partial hour up, so a one-minute overrun is not reported as zero', () => {
    const deadline = new Date(NOW.getTime() - 60 * 1000);
    expect(noticeShortfall(deadline, NOW)).toEqual({
      shortfallHours: 1,
      shortfallLabel: '1 hour',
    });
  });

  it('phrases a sub-two-day shortfall in hours', () => {
    expect(noticeShortfall(new Date(NOW.getTime() - 6 * HOUR), NOW)).toEqual({
      shortfallHours: 6,
      shortfallLabel: '6 hours',
    });
    // 47 hours is still hours; 48 is where days take over.
    expect(noticeShortfall(new Date(NOW.getTime() - 47 * HOUR), NOW)?.shortfallLabel)
      .toBe('47 hours');
  });

  it('phrases a two-day-or-longer shortfall in days', () => {
    expect(noticeShortfall(new Date(NOW.getTime() - 2 * DAY), NOW)?.shortfallLabel)
      .toBe('2 days');
    // A blown 14-day owner-meeting window reads as "14 days", not "336 hours".
    expect(noticeShortfall(new Date(NOW.getTime() - 14 * DAY), NOW)?.shortfallLabel)
      .toBe('14 days');
  });

  it('keeps shortfallHours exact even when the label switches to days', () => {
    expect(noticeShortfall(new Date(NOW.getTime() - 3 * DAY), NOW)?.shortfallHours).toBe(72);
  });

  it('declines an unparseable date instead of inventing a shortfall', () => {
    expect(noticeShortfall(new Date('nonsense'), NOW)).toBeNull();
    expect(noticeShortfall(NOW, new Date('nonsense'))).toBeNull();
  });

  it('measures elapsed time, not calendar days, across a DST transition', () => {
    // US DST began 2026-03-08. A local-calendar shift would call this span 30
    // days when it is 719 hours; the whole point of the ms arithmetic is that
    // both sides here are instants and the answer does not move.
    const deadline = new Date('2026-03-07T12:00:00.000Z');
    const now = new Date('2026-03-09T12:00:00.000Z');
    expect(noticeShortfall(deadline, now)).toEqual({
      shortfallHours: 48,
      shortfallLabel: '2 days',
    });
  });
});
