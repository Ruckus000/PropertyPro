/**
 * One derived reading of a meeting's compliance state, shared by the schedule
 * table, the minutes list and the next-notice strip (design prototype
 * `pp-meetings.js` — `status`/`note`/`clock`).
 *
 * The inputs are exactly what `/api/v1/meetings` already returns: the schema
 * stamps plus the deadlines the API derives. Nothing here restates a lead
 * time — the notice window is read back off the deadline the API computed, so
 * a label can never disagree with the deadline shown beside it.
 */
import { describe, expect, it } from 'vitest';
import {
  deadlineEscalation,
  deriveMeetingStatus,
  describeMeetingStatus,
  formatDeadlineStamp,
  minutesOwedCount,
  nextNoticeOwed,
  noticeWindowLabel,
  splitSchedule,
} from '@/lib/meetings/meeting-status';

const TZ = 'America/New_York';
// Wed Aug 26 2026, 09:12 in New York (13:12Z).
const NOW = new Date('2026-08-26T13:12:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function iso(offsetMs: number, from: Date = NOW): string {
  return new Date(from.getTime() + offsetMs).toISOString();
}

/** A meeting `startOffset` from NOW with a `leadMs` notice window. */
function meeting(
  startOffset: number,
  leadMs: number,
  extra: Partial<{ noticePostedAt: string | null; minutesApprovedAt: string | null; id: number }> = {},
) {
  const startsAt = new Date(NOW.getTime() + startOffset);
  return {
    id: extra.id ?? 1,
    startsAt: startsAt.toISOString(),
    noticePostedAt: extra.noticePostedAt ?? null,
    minutesApprovedAt: extra.minutesApprovedAt ?? null,
    deadlines: {
      noticePostBy: new Date(startsAt.getTime() - leadMs).toISOString(),
      ownerVoteDocsBy: new Date(startsAt.getTime() - 7 * DAY).toISOString(),
      minutesPostBy: new Date(startsAt.getTime() + 30 * DAY).toISOString(),
    },
  };
}

const BOARD = 2 * DAY;
const OWNER = 14 * DAY;

describe('deriveMeetingStatus', () => {
  it('a past meeting with approved minutes is minutes_published', () => {
    const m = meeting(-3 * DAY, BOARD, { minutesApprovedAt: iso(-1 * DAY) });
    expect(deriveMeetingStatus(m, NOW)).toBe('minutes_published');
  });

  it('a past meeting without approved minutes is minutes_owed', () => {
    expect(deriveMeetingStatus(meeting(-3 * DAY, BOARD), NOW)).toBe('minutes_owed');
  });

  it('an upcoming meeting whose notice is posted is noticed, whatever the deadline', () => {
    const late = meeting(1 * DAY, BOARD, { noticePostedAt: iso(-2 * HOUR) });
    expect(deriveMeetingStatus(late, NOW)).toBe('noticed');
  });

  it('an upcoming meeting past its notice deadline with nothing posted is notice_missed', () => {
    // Board meeting tomorrow: the 48-hour deadline passed yesterday.
    expect(deriveMeetingStatus(meeting(1 * DAY, BOARD), NOW)).toBe('notice_missed');
  });

  it('a deadline landing exactly on now is not missed — the notice can still post', () => {
    expect(deriveMeetingStatus(meeting(BOARD, BOARD), NOW)).toBe('notice_pending');
  });

  it('a notice deadline within ten days is notice_pending', () => {
    // Annual meeting in 20 days: 14-day notice is due in 6 days.
    expect(deriveMeetingStatus(meeting(20 * DAY, OWNER), NOW)).toBe('notice_pending');
  });

  it('a notice deadline more than ten days out is scheduled', () => {
    // Annual meeting in 40 days: notice is due in 26 days.
    expect(deriveMeetingStatus(meeting(40 * DAY, OWNER), NOW)).toBe('scheduled');
  });
});

describe('describeMeetingStatus', () => {
  it('names the next thing owed, with the date in the community timezone', () => {
    // Annual meeting Sep 15 18:30 NY; notice due Sep 1.
    const start = new Date('2026-09-15T22:30:00.000Z');
    const m = meeting(start.getTime() - NOW.getTime(), OWNER);
    expect(describeMeetingStatus(m, NOW, TZ)).toEqual({
      status: 'notice_pending',
      badge: 'due_soon',
      label: 'Notice posts Sep 1',
    });
  });

  it('reports a missed notice by its deadline date, as overdue', () => {
    const m = meeting(1 * DAY, BOARD);
    expect(describeMeetingStatus(m, NOW, TZ)).toEqual({
      status: 'notice_missed',
      badge: 'overdue',
      label: 'Notice was due Aug 25',
    });
  });

  it('reports a posted notice by the day it was posted', () => {
    const m = meeting(5 * DAY, BOARD, { noticePostedAt: '2026-08-20T15:00:00.000Z' });
    expect(describeMeetingStatus(m, NOW, TZ)).toEqual({
      status: 'noticed',
      badge: 'compliant',
      label: 'Noticed Aug 20',
    });
  });

  it('reports owed minutes by their posting deadline while it is still ahead', () => {
    // Met 10 days ago; minutes due 20 days from now.
    const m = meeting(-10 * DAY, BOARD);
    expect(describeMeetingStatus(m, NOW, TZ)).toEqual({
      status: 'minutes_owed',
      badge: 'pending',
      label: 'Minutes due Sep 15',
    });
  });

  it('reports late minutes by how late they are, as overdue', () => {
    // Met 33 days ago; the 30-day minutes deadline passed 3 days ago.
    const m = meeting(-33 * DAY, BOARD);
    expect(describeMeetingStatus(m, NOW, TZ)).toEqual({
      status: 'minutes_owed',
      badge: 'overdue',
      label: 'Minutes 3 days late',
    });
  });

  it('reports published minutes and a plain scheduled meeting', () => {
    expect(
      describeMeetingStatus(meeting(-3 * DAY, BOARD, { minutesApprovedAt: iso(-DAY) }), NOW, TZ),
    ).toEqual({ status: 'minutes_published', badge: 'completed', label: 'Minutes posted' });
    expect(describeMeetingStatus(meeting(40 * DAY, OWNER), NOW, TZ)).toEqual({
      status: 'scheduled',
      badge: 'draft',
      label: 'Scheduled',
    });
  });
});

describe('noticeWindowLabel', () => {
  it('reads the window back off the API deadline: 48 hours for board, 14 days for owners', () => {
    expect(noticeWindowLabel(meeting(5 * DAY, BOARD))).toBe('48 hours');
    expect(noticeWindowLabel(meeting(30 * DAY, OWNER))).toBe('14 days');
  });
});

describe('deadlineEscalation', () => {
  it('escalates calm → aware → urgent → critical as the deadline approaches and passes', () => {
    expect(deadlineEscalation(iso(31 * DAY), NOW)).toEqual({ variant: 'neutral', label: 'Calm' });
    expect(deadlineEscalation(iso(30 * DAY), NOW)).toEqual({ variant: 'warning', label: 'Aware' });
    expect(deadlineEscalation(iso(7 * DAY), NOW)).toEqual({ variant: 'warning', label: 'Urgent' });
    expect(deadlineEscalation(iso(-1 * HOUR), NOW)).toEqual({ variant: 'danger', label: 'Critical' });
  });
});

describe('formatDeadlineStamp', () => {
  it('shows weekday, date and time in the community timezone — a deadline can land on a Saturday', () => {
    // Sat Aug 29 2026, 6:30 PM New York.
    expect(formatDeadlineStamp('2026-08-29T22:30:00.000Z', TZ)).toBe('Sat, Aug 29, 2026 · 6:30 PM');
  });
});

describe('schedule helpers', () => {
  const past1 = meeting(-40 * DAY, BOARD, { id: 1, minutesApprovedAt: iso(-20 * DAY) });
  const past2 = meeting(-5 * DAY, BOARD, { id: 2 });
  const soon = meeting(1 * DAY, BOARD, { id: 3 });
  const noticed = meeting(3 * DAY, BOARD, { id: 4, noticePostedAt: iso(-DAY) });
  const later = meeting(40 * DAY, OWNER, { id: 5 });
  const all = [later, past2, noticed, past1, soon];

  it('splitSchedule orders upcoming soonest-first and past most-recent-first', () => {
    const { upcoming, past } = splitSchedule(all, NOW);
    expect(upcoming.map((m) => m.id)).toEqual([3, 4, 5]);
    expect(past.map((m) => m.id)).toEqual([2, 1]);
  });

  it('nextNoticeOwed is the upcoming meeting with the earliest unposted notice deadline', () => {
    // `noticed` (id 4) is excluded even though its meeting is sooner than `later`.
    expect(nextNoticeOwed(all, NOW)?.id).toBe(3);
    expect(nextNoticeOwed([noticed, past2], NOW)).toBeNull();
  });

  it('minutesOwedCount counts past meetings without approved minutes', () => {
    expect(minutesOwedCount(all, NOW)).toBe(1);
  });
});
