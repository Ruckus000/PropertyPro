/**
 * The meeting-notice checklist row, scored per meeting.
 *
 * `718_meeting_notices` / `720_meeting_notices` used to be satisfied by linking
 * any one document whose title matched `notice|agenda`, for twelve months. That
 * proved nothing about any meeting: creating a meeting, or recording its
 * notice, never touched the row, and an empty row was never overdue (audit
 * 2026-11-05, H-4).
 *
 * The statute is per meeting: each owner/member meeting's notice and agenda 14
 * days before it, each board meeting's 48 hours before (§718.111(12)(g)2.m–n,
 * §720.303(4)(b)1.l–m). So the row now reads the meetings themselves, from
 * `meetings.notice_posted_at` — the same column the transparency page reports.
 *
 * Pure: meetings in, a summary and a status out. The loaders read the rows.
 */
import type { CommunityType } from '@propertypro/shared';
import {
  calculateNoticePostBy,
  type MeetingType,
} from '@/lib/utils/meeting-calculator';
import {
  calculateRollingWindowStart,
  SEVEN_DAYS_MS,
  type ComplianceStatus,
} from '@/lib/utils/compliance-calculator';

/** The checklist rows this rule scores. */
export const MEETING_NOTICE_TEMPLATE_KEYS: ReadonlySet<string> = new Set([
  '718_meeting_notices',
  '720_meeting_notices',
]);

/** How far back a missed notice keeps counting: the row's rolling 12 months. */
export const MEETING_NOTICE_WINDOW_MONTHS = 12;

/** The fields one meeting contributes. */
export interface MeetingNoticeInput {
  id: number;
  title: string;
  meetingType: string;
  startsAt: Date;
  noticePostedAt: Date | null;
}

export interface MeetingNoticeMiss {
  meetingId: number;
  title: string;
  startsAt: string;
  /** The latest moment the notice could be posted and still be on time. */
  postBy: string;
  /** When the notice was recorded as posted; null when it never was. */
  noticePostedAt: string | null;
}

export interface MeetingNoticeUpcoming {
  meetingId: number;
  title: string;
  startsAt: string;
  postBy: string;
}

/** What the checklist row carries, so the UI can say which meeting it means. */
export interface MeetingNoticeSummary {
  windowMonths: number;
  /** Meetings in the window whose notice deadline has passed. */
  dueCount: number;
  /** Of those, notices recorded on or before the deadline. */
  onTimeCount: number;
  /** The rest, most recent meeting first. */
  missed: MeetingNoticeMiss[];
  /** The soonest upcoming meeting whose notice is not yet recorded. */
  nextDue: MeetingNoticeUpcoming | null;
}

/**
 * Summarize every meeting from 12 months ago onward.
 *
 * A meeting is DUE once its notice deadline has passed — every past meeting
 * is, and so is an upcoming one already inside its window. It is ON TIME when
 * a notice was recorded no later than that deadline. A late record and no
 * record are both misses: nothing shows the notice went up in time.
 */
export function summarizeMeetingNotices(
  meetings: readonly MeetingNoticeInput[],
  communityType: CommunityType,
  now: Date,
): MeetingNoticeSummary {
  const windowStart = calculateRollingWindowStart(now, MEETING_NOTICE_WINDOW_MONTHS).getTime();
  const nowMs = now.getTime();

  let dueCount = 0;
  let onTimeCount = 0;
  const missed: MeetingNoticeMiss[] = [];
  let nextDue: MeetingNoticeUpcoming | null = null;

  for (const meeting of meetings) {
    const startsAtMs = meeting.startsAt.getTime();
    if (!Number.isFinite(startsAtMs) || startsAtMs < windowStart) continue;

    const postBy = calculateNoticePostBy(
      meeting.startsAt,
      meeting.meetingType as MeetingType,
      communityType,
    );

    if (postBy.getTime() > nowMs) {
      // Not due yet. Already recorded is simply done early; otherwise it is a
      // candidate for the next deadline.
      if (meeting.noticePostedAt === null && (nextDue === null || postBy.getTime() < Date.parse(nextDue.postBy))) {
        nextDue = {
          meetingId: meeting.id,
          title: meeting.title,
          startsAt: meeting.startsAt.toISOString(),
          postBy: postBy.toISOString(),
        };
      }
      continue;
    }

    dueCount += 1;
    if (meeting.noticePostedAt !== null && meeting.noticePostedAt.getTime() <= postBy.getTime()) {
      onTimeCount += 1;
    } else {
      missed.push({
        meetingId: meeting.id,
        title: meeting.title,
        startsAt: meeting.startsAt.toISOString(),
        postBy: postBy.toISOString(),
        noticePostedAt: meeting.noticePostedAt?.toISOString() ?? null,
      });
    }
  }

  missed.sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  return { windowMonths: MEETING_NOTICE_WINDOW_MONTHS, dueCount, onTimeCount, missed, nextDue };
}

/**
 * The row's status from its meetings, in precedence order:
 *
 * 1. A missed notice in the last 12 months → `overdue`. It cannot be cured
 *    afterwards, so it counts until the meeting ages out of the window.
 * 2. An upcoming notice due within 7 days and not yet recorded → `unsatisfied`,
 *    with that deadline, so it surfaces in "Action needed" like any other
 *    posting due soon. Further out, it does not lower the score: scheduling
 *    early must not read as a gap.
 * 3. At least one due meeting, every one on time → `satisfied`.
 * 4. No due meeting at all → `null`: the meetings say nothing yet, and the
 *    caller keeps the row's document-based status. An association that has not
 *    scheduled its meetings in the product is scored as before.
 */
export function meetingNoticeStatus(
  summary: MeetingNoticeSummary,
  now: Date,
): { status: ComplianceStatus; deadline: string | null } | null {
  const nextDeadline = summary.nextDue?.postBy ?? null;
  if (summary.missed.length > 0) {
    return { status: 'overdue', deadline: nextDeadline };
  }
  if (nextDeadline !== null && Date.parse(nextDeadline) - now.getTime() <= SEVEN_DAYS_MS) {
    return { status: 'unsatisfied', deadline: nextDeadline };
  }
  if (summary.dueCount > 0) {
    return { status: 'satisfied', deadline: nextDeadline };
  }
  return null;
}
