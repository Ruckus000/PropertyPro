/**
 * One derived reading of a meeting's compliance state.
 *
 * Read by the schedule table, the minutes list and the next-notice strip on
 * the meetings page (design prototype `pp-meetings.js`), so the three views
 * can never disagree about what a meeting owes.
 *
 * Inputs are exactly what `/api/v1/meetings` returns: the schema stamps
 * (`noticePostedAt`, `minutesApprovedAt`) and the deadlines the API derives.
 * No lead time is restated here — the notice window is read back off the
 * deadline the API computed, so a label cannot disagree with the deadline
 * shown beside it. Elapsed time is exact milliseconds, like every other
 * deadline in the app: no calendar arithmetic, no DST-shortened days.
 */
import { noticeShortfall } from '@/lib/compliance/notice-window';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * How far ahead of its deadline a notice counts as "due soon". Ten days, from
 * the prototype: long enough that an owner meeting's 14-day notice gets a
 * warning before the week it is owed, short enough that a meeting scheduled
 * months out is not shouting.
 */
const NOTICE_PENDING_WINDOW_MS = 10 * DAY_MS;

export type MeetingStatusKey =
  | 'scheduled'
  | 'notice_pending'
  | 'notice_missed'
  | 'noticed'
  | 'minutes_owed'
  | 'minutes_published';

export interface MeetingStatusInput {
  startsAt: string;
  noticePostedAt: string | null;
  minutesApprovedAt: string | null;
  deadlines: {
    noticePostBy: string;
    minutesPostBy: string;
  };
}

export interface MeetingStatusDescription {
  status: MeetingStatusKey;
  /** A `STATUS_CONFIG` key, so `StatusBadge` paints icon + text + colour. */
  badge: 'completed' | 'pending' | 'overdue' | 'compliant' | 'due_soon' | 'draft';
  label: string;
}

function startsAtMs(meeting: MeetingStatusInput): number {
  return new Date(meeting.startsAt).getTime();
}

export function deriveMeetingStatus(meeting: MeetingStatusInput, now: Date): MeetingStatusKey {
  if (startsAtMs(meeting) < now.getTime()) {
    return meeting.minutesApprovedAt ? 'minutes_published' : 'minutes_owed';
  }
  if (meeting.noticePostedAt) {
    return 'noticed';
  }
  const noticeBy = new Date(meeting.deadlines.noticePostBy);
  // A deadline landing exactly on `now` is not missed — the notice can still
  // post at that instant, which is what the statutory minimum permits.
  if (noticeShortfall(noticeBy, now)) {
    return 'notice_missed';
  }
  if (noticeBy.getTime() - now.getTime() <= NOTICE_PENDING_WINDOW_MS) {
    return 'notice_pending';
  }
  return 'scheduled';
}

/** `Sep 1` — the day, in the community's clock. */
export function formatShortDate(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
  });
}

/**
 * `Sat, Aug 29, 2026 · 6:30 PM` — weekday AND time, in the community's clock.
 *
 * These deadlines carry the meeting's clock time, so a date alone reads as
 * "any time that day" and invites posting hours late. The weekday matters too:
 * with no weekend rule a deadline can legitimately land on a Saturday, and a
 * manager needs to see that rather than discover it.
 */
export function formatDeadlineStamp(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${day} · ${time}`;
}

/** The next thing this meeting owes, named — and the badge to paint it with. */
export function describeMeetingStatus(
  meeting: MeetingStatusInput,
  now: Date,
  timeZone: string,
): MeetingStatusDescription {
  const status = deriveMeetingStatus(meeting, now);
  switch (status) {
    case 'minutes_published':
      return { status, badge: 'completed', label: 'Minutes published' };
    case 'minutes_owed': {
      const late = noticeShortfall(new Date(meeting.deadlines.minutesPostBy), now);
      return late
        ? { status, badge: 'overdue', label: `Minutes ${late.shortfallLabel} late` }
        : {
            status,
            badge: 'pending',
            label: `Minutes due ${formatShortDate(meeting.deadlines.minutesPostBy, timeZone)}`,
          };
    }
    case 'noticed':
      return {
        status,
        badge: 'compliant',
        // `noticed` is only derived when the stamp is present.
        label: `Noticed ${formatShortDate(meeting.noticePostedAt as string, timeZone)}`,
      };
    case 'notice_missed':
      return {
        status,
        badge: 'overdue',
        label: `Notice was due ${formatShortDate(meeting.deadlines.noticePostBy, timeZone)}`,
      };
    case 'notice_pending':
      return {
        status,
        badge: 'due_soon',
        label: `Notice posts ${formatShortDate(meeting.deadlines.noticePostBy, timeZone)}`,
      };
    case 'scheduled':
      return { status, badge: 'draft', label: 'Scheduled' };
  }
}

/**
 * `48 hours` or `14 days`, read back off the deadline the API derived rather
 * than recomputed from the meeting type — one source for the window.
 */
export function noticeWindowLabel(meeting: MeetingStatusInput): string {
  const leadMs = startsAtMs(meeting) - new Date(meeting.deadlines.noticePostBy).getTime();
  if (leadMs <= 2 * DAY_MS) {
    return '48 hours';
  }
  return `${Math.round(leadMs / DAY_MS)} days`;
}

/**
 * The compliance escalation for a deadline: calm (>30d) / aware (8–30d) /
 * urgent (1–7d) / critical (overdue) — `packages/ui/src/tokens/compliance.ts`.
 * Whole days, floored, so a deadline later today is still "urgent", not
 * "critical".
 */
export function deadlineEscalation(
  deadlineIso: string,
  now: Date,
): { variant: 'neutral' | 'warning' | 'danger'; label: string } {
  const daysUntil = Math.floor((new Date(deadlineIso).getTime() - now.getTime()) / DAY_MS);
  if (daysUntil < 0) {
    return { variant: 'danger', label: 'Critical' };
  }
  if (daysUntil <= 7) {
    return { variant: 'warning', label: 'Urgent' };
  }
  if (daysUntil <= 30) {
    return { variant: 'warning', label: 'Aware' };
  }
  return { variant: 'neutral', label: 'Calm' };
}

/** Upcoming soonest-first, past most-recent-first. */
export function splitSchedule<T extends MeetingStatusInput>(
  meetings: readonly T[],
  now: Date,
): { upcoming: T[]; past: T[] } {
  const nowMs = now.getTime();
  const upcoming = meetings
    .filter((meeting) => startsAtMs(meeting) >= nowMs)
    .sort((a, b) => startsAtMs(a) - startsAtMs(b));
  const past = meetings
    .filter((meeting) => startsAtMs(meeting) < nowMs)
    .sort((a, b) => startsAtMs(b) - startsAtMs(a));
  return { upcoming, past };
}

/**
 * The one piece of cross-view context worth carrying: the next notice owed.
 * `null` when nothing is — an "all clear" strip is clutter nobody needed.
 */
export function nextNoticeOwed<T extends MeetingStatusInput>(
  meetings: readonly T[],
  now: Date,
): T | null {
  const owed = splitSchedule(meetings, now)
    .upcoming.filter((meeting) => !meeting.noticePostedAt)
    .sort(
      (a, b) =>
        new Date(a.deadlines.noticePostBy).getTime() - new Date(b.deadlines.noticePostBy).getTime(),
    );
  return owed[0] ?? null;
}

export function minutesOwedCount(meetings: readonly MeetingStatusInput[], now: Date): number {
  return splitSchedule(meetings, now).past.filter((meeting) => !meeting.minutesApprovedAt).length;
}
