/**
 * The minutes checklist row, scored per board meeting.
 *
 * `718_minutes_rolling_12m` / `720_minutes_rolling_12m` used to hold one
 * document, and the rolling window only checked that document's age. One set
 * of minutes stood in for a year of meetings (audit 2026-11-05, H-5).
 *
 * The statute is per meeting: the approved minutes of ALL board meetings over
 * the preceding 12 months (§718.111(12)(g)2.e), each posted within 30 days of
 * the association creating the record (§718.111(12)(g)1.) — for minutes, their
 * approval. So the row now reads the board meetings themselves:
 *
 * - `meetings.minutes_approved_at`: when the minutes were put on the record
 *   (the posting stamp; the name predates this distinction);
 * - `meetings.minutes_document_id` → `documents.received_at`: the approval
 *   date, when known.
 *
 * Same shape as `MeetingNoticeSummary`, so the checklist renders both alike.
 * Pure: meetings in, a summary and a status out. The loaders read the rows.
 */
import {
  calculatePostingDeadline,
  calculateRollingWindowStart,
  type ComplianceStatus,
} from '@/lib/utils/compliance-calculator';
import { MEETING_NOTICE_WINDOW_MONTHS } from './meeting-notice-status';

/** The checklist rows this rule scores. */
export const MEETING_MINUTES_TEMPLATE_KEYS: ReadonlySet<string> = new Set([
  '718_minutes_rolling_12m',
  '720_minutes_rolling_12m',
]);

/** The statute's window: the preceding 12 months. */
export const MEETING_MINUTES_WINDOW_MONTHS = 12;

/** The window the loaders read meetings over: the longer of the two rows'. */
export const MEETING_SCORING_WINDOW_MONTHS = Math.max(
  MEETING_NOTICE_WINDOW_MONTHS,
  MEETING_MINUTES_WINDOW_MONTHS,
);

/**
 * Meeting types whose minutes the row requires. (g)2.e names board meetings;
 * a budget meeting is the board adopting the budget. Owner meetings (annual)
 * are outside it.
 *
 * ponytail: `special` and `committee` are not counted, because the type cannot
 * tell a special BOARD meeting from a special owner meeting (the same limit
 * #1501 records for notice lead times). Trigger: meetings gain an
 * owner/board flag, or a board reports a special board meeting missing here.
 */
export const MINUTES_MEETING_TYPES: ReadonlySet<string> = new Set(['board', 'budget']);

/** The fields one meeting contributes. */
export interface MeetingMinutesInput {
  id: number;
  title: string;
  meetingType: string;
  startsAt: Date;
  /** `meetings.minutes_approved_at`: when the minutes went on the record. */
  minutesPostedAt: Date | null;
  /**
   * The minutes document, when the meeting names one. `null` for minutes
   * posted before `minutes_document_id` existed: posted, approval date unknown.
   */
  minutesDocument: {
    /** `documents.received_at`: the approval date, when recorded. */
    receivedAt: Date | null;
    /** Deleted or back to a draft: the minutes are no longer posted. */
    available: boolean;
  } | null;
}

export interface MeetingMinutesMiss {
  meetingId: number;
  title: string;
  startsAt: string;
  /** 30 days after approval; null when the minutes were never posted. */
  postBy: string | null;
  /** When the minutes went on the record; null when they never did. */
  minutesPostedAt: string | null;
  /**
   * `posted_late`: posted more than 30 days after approval.
   * `not_posted`: a later board meeting has been held — where these minutes
   * would normally have been approved — and none are posted.
   */
  reason: 'posted_late' | 'not_posted';
}

export interface MeetingMinutesAwaiting {
  meetingId: number;
  title: string;
  startsAt: string;
}

/** What the checklist row carries, so the UI can say which meeting it means. */
export interface MeetingMinutesSummary {
  windowMonths: number;
  /** Held board meetings in the window whose minutes are owed by now. */
  dueCount: number;
  /** Of those, minutes posted (within 30 days of approval, when it is known). */
  onTimeCount: number;
  /** The rest, most recent meeting first. */
  missed: MeetingMinutesMiss[];
  /**
   * The most recent held board meeting with no minutes and no later board
   * meeting yet: its minutes are awaiting approval, and no clock applies.
   */
  nextDue: MeetingMinutesAwaiting | null;
}

/**
 * Summarize the board meetings held from 12 months ago until now.
 *
 * Minutes are owed once approved, and approval normally happens at the next
 * board meeting. The statute sets no deadline for approval, so a meeting with
 * no later board meeting yet is AWAITING (not due). Once a later board meeting
 * has been held, missing minutes are a miss. Posted minutes are on time unless
 * their approval date is known and they went up more than 30 days after it.
 */
export function summarizeMeetingMinutes(
  meetings: readonly MeetingMinutesInput[],
  now: Date,
): MeetingMinutesSummary {
  const windowStart = calculateRollingWindowStart(now, MEETING_MINUTES_WINDOW_MONTHS).getTime();
  const nowMs = now.getTime();

  const held = meetings
    .filter((meeting) => {
      const startsAtMs = meeting.startsAt.getTime();
      return (
        MINUTES_MEETING_TYPES.has(meeting.meetingType) &&
        Number.isFinite(startsAtMs) &&
        startsAtMs <= nowMs
      );
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id - b.id);
  // Held board meetings are sorted ascending, so the last one has no later meeting.
  const latestHeldMs = held.length > 0 ? held[held.length - 1]!.startsAt.getTime() : null;

  let dueCount = 0;
  let onTimeCount = 0;
  const missed: MeetingMinutesMiss[] = [];
  let nextDue: MeetingMinutesAwaiting | null = null;

  for (const meeting of held) {
    const startsAtMs = meeting.startsAt.getTime();
    if (startsAtMs < windowStart) continue;

    const posted =
      meeting.minutesPostedAt !== null &&
      (meeting.minutesDocument === null || meeting.minutesDocument.available);

    if (!posted) {
      const laterMeetingHeld = latestHeldMs !== null && latestHeldMs > startsAtMs;
      if (!laterMeetingHeld) {
        nextDue = {
          meetingId: meeting.id,
          title: meeting.title,
          startsAt: meeting.startsAt.toISOString(),
        };
        continue;
      }
      dueCount += 1;
      missed.push({
        meetingId: meeting.id,
        title: meeting.title,
        startsAt: meeting.startsAt.toISOString(),
        postBy: null,
        minutesPostedAt: null,
        reason: 'not_posted',
      });
      continue;
    }

    dueCount += 1;
    const approvedAt = meeting.minutesDocument?.receivedAt ?? null;
    const postBy = approvedAt ? calculatePostingDeadline(approvedAt) : null;
    // Exact milliseconds: posting AT the deadline is on time.
    if (postBy !== null && meeting.minutesPostedAt!.getTime() > postBy.getTime()) {
      missed.push({
        meetingId: meeting.id,
        title: meeting.title,
        startsAt: meeting.startsAt.toISOString(),
        postBy: postBy.toISOString(),
        minutesPostedAt: meeting.minutesPostedAt!.toISOString(),
        reason: 'posted_late',
      });
    } else {
      onTimeCount += 1;
    }
  }

  missed.sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  return { windowMonths: MEETING_MINUTES_WINDOW_MONTHS, dueCount, onTimeCount, missed, nextDue };
}

/**
 * The row's status from its board meetings, in precedence order:
 *
 * 1. Minutes posted more than 30 days after approval → `overdue`, with the
 *    latest deadline that was missed (an overdue row carries the deadline it
 *    missed, #1506). It cannot be cured, so it counts until the meeting ages
 *    out of the window.
 * 2. Minutes missing after a later board meeting → `unsatisfied`, with no
 *    deadline: the statute sets no approval deadline, so no "N days overdue"
 *    is invented. The row is board action (`BOARD_ACTION_TEMPLATE_KEYS`).
 * 3. At least one due meeting, all posted on time → `satisfied`.
 * 4. No due meeting → `null`: the meetings say nothing yet, and the caller
 *    keeps the row's document-based status. An association that does not
 *    schedule its board meetings in the product is scored as before.
 */
export function meetingMinutesStatus(
  summary: MeetingMinutesSummary,
): { status: ComplianceStatus; deadline: string | null; postedAt: string | null } | null {
  const late = summary.missed.filter((miss) => miss.reason === 'posted_late');
  if (late.length > 0) {
    const lastMissed = late.reduce((latest, miss) =>
      Date.parse(miss.postBy!) > Date.parse(latest.postBy!) ? miss : latest,
    );
    return { status: 'overdue', deadline: lastMissed.postBy, postedAt: lastMissed.minutesPostedAt };
  }
  if (summary.missed.length > 0) {
    return { status: 'unsatisfied', deadline: null, postedAt: null };
  }
  if (summary.dueCount > 0) {
    return { status: 'satisfied', deadline: null, postedAt: null };
  }
  return null;
}

/** A meeting as the compliance loaders read it: what both rows need. */
export interface ComplianceScoringMeeting {
  id: number;
  title: string;
  meetingType: string;
  startsAt: Date;
  noticePostedAt: Date | null;
  minutesApprovedAt: Date | null;
  minutesDocumentId: number | null;
}

/** The facts about a minutes document that decide whether it still counts. */
export interface MinutesDocumentState {
  deletedAt: Date | null;
  isDraft: boolean;
  receivedAt?: Date | null;
}

/** The ids of the minutes documents the meetings name, for one document read. */
export function minutesDocumentIds(meetings: readonly ComplianceScoringMeeting[]): number[] {
  return meetings
    .map((meeting) => meeting.minutesDocumentId)
    .filter((id): id is number => typeof id === 'number');
}

/**
 * Join each meeting to its minutes document. A named document that is
 * missing from `documents` (it should not be: the FK nulls on delete and the
 * read includes soft-deleted rows) is treated as not available, so it never
 * counts as posted minutes.
 */
export function toMinutesInputs(
  meetings: readonly ComplianceScoringMeeting[],
  documents: ReadonlyMap<number, MinutesDocumentState>,
): MeetingMinutesInput[] {
  return meetings.map((meeting) => {
    const state =
      meeting.minutesDocumentId != null ? documents.get(meeting.minutesDocumentId) : undefined;
    return {
      id: meeting.id,
      title: meeting.title,
      meetingType: meeting.meetingType,
      startsAt: meeting.startsAt,
      minutesPostedAt: meeting.minutesApprovedAt,
      minutesDocument:
        meeting.minutesDocumentId == null
          ? null
          : {
              receivedAt: state?.receivedAt ?? null,
              available: state !== undefined && state.deletedAt == null && !state.isDraft,
            },
    };
  });
}
