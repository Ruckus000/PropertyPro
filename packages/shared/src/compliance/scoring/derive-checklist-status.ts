/**
 * The pure half of the compliance loader: one checklist row in, the same row
 * with its derived status out. Kept free of service imports so callers that
 * read checklist rows in bulk (the PM Communities summary) can apply the very
 * same rule without loading the per-community services.
 */
import {
  calculateComplianceClock,
  type ChecklistClock,
  type ChecklistClockState,
} from './clock';
import type { LinkedDocumentState } from './linked-document-state';
import {
  MEETING_NOTICE_TEMPLATE_KEYS,
  meetingNoticeStatus,
  type MeetingNoticeSummary,
} from './meeting-notice-status';
import {
  MEETING_MINUTES_TEMPLATE_KEYS,
  meetingMinutesStatus,
  type MeetingMinutesSummary,
} from './meeting-minutes-status';
import { clockBasisFor, YEARLY_RECORD_TEMPLATE_KEYS } from './record-cycles';

/**
 * A community's per-meeting results. Each decides its own checklist row;
 * `null` when the loader did not read the meetings (no such row).
 */
export interface MeetingScoring {
  notices: MeetingNoticeSummary | null;
  minutes: MeetingMinutesSummary | null;
}

/**
 * Decorate a checklist row with its derived compliance status and clock.
 *
 * `documentStateById` maps a linked document id to whether it is deleted or a
 * draft, when it was posted and when it was received. A deleted or draft file
 * may not keep the item satisfied; a posted one is judged against its own
 * 30-day clock (`calculateComplianceClock`).
 *
 * Below the website rule's size threshold (`postingClockApplies` false) the row
 * goes out without its posting clock — no deadline, no rolling window, no
 * yearly cycle, no record clock — so it can be posted or not, but never overdue
 * or "due soon" anywhere it is shown.
 *
 * `meetings` holds the community's per-meeting summaries. On a meeting-notice
 * or minutes row the matching summary decides the status and rides along
 * (`meetingNotices` / `meetingMinutes`), so the UI can name the meeting. When
 * the meetings say nothing yet, the row keeps its document-based status.
 * Ignored on every other row, on a row marked "doesn't apply", and below the
 * size threshold.
 */
export function withDerivedStatus(
  storedRow: Record<string, unknown>,
  documentStateById: Map<number, LinkedDocumentState> = new Map(),
  clockApplies = true,
  meetings: MeetingScoring | null = null,
  now: Date = new Date(),
): Record<string, unknown> {
  const row = clockApplies ? storedRow : { ...storedRow, deadline: null, rollingWindow: null };
  const templateKey = String(row['templateKey'] ?? '');
  const deadline = row['deadline'] ? new Date(row['deadline'] as string) : null;
  const documentPostedAt = row['documentPostedAt']
    ? new Date(row['documentPostedAt'] as string)
    : null;

  const rollingWindowRecord = row['rollingWindow'] as Record<string, unknown> | null;
  const rollingWindowMonths =
    typeof rollingWindowRecord?.months === 'number' ? rollingWindowRecord.months : null;

  const documentId = (row['documentId'] as number | null) ?? null;
  const linked = documentId != null ? documentStateById.get(documentId) : undefined;
  const basis = clockBasisFor(templateKey);

  const document = calculateComplianceClock({
    isApplicable: row['isApplicable'] as boolean | undefined,
    documentId,
    documentPostedAt,
    documentPublishedAt: linked?.postedAt ?? null,
    documentReceivedAt: clockApplies ? (linked?.receivedAt ?? null) : null,
    documentDeletedAt: linked?.deletedAt ?? null,
    documentIsDraft: linked?.isDraft ?? false,
    deadline,
    rollingWindowMonths,
    yearlyCycle: clockApplies && YEARLY_RECORD_TEMPLATE_KEYS.has(templateKey),
    basis,
    now,
  });

  const scorable = meetings !== null && clockApplies && document.status !== 'not_applicable';
  const notices =
    scorable && MEETING_NOTICE_TEMPLATE_KEYS.has(templateKey) ? meetings.notices : null;
  const minutes =
    scorable && MEETING_MINUTES_TEMPLATE_KEYS.has(templateKey) ? meetings.minutes : null;

  let fromMeetings: { status: ComplianceStatusValue; deadline: string | null; clock: ChecklistClock } | null =
    null;
  if (notices) {
    const result = meetingNoticeStatus(notices, now);
    if (result) {
      const lateMiss = notices.missed.find((miss) => miss.postBy === result.deadline);
      const state: ChecklistClockState =
        result.status === 'overdue'
          ? lateMiss?.noticePostedAt
            ? 'met_late'
            : 'overdue'
          : result.status === 'unsatisfied'
            ? 'open'
            : 'met';
      fromMeetings = {
        status: result.status,
        deadline: result.deadline,
        clock: {
          state,
          deadline: result.deadline,
          postedAt: state === 'met_late' ? (lateMiss?.noticePostedAt ?? null) : null,
          basis,
        },
      };
    }
  } else if (minutes) {
    const result = meetingMinutesStatus(minutes);
    if (result) {
      const state: ChecklistClockState =
        result.status === 'overdue' ? 'met_late' : result.status === 'unsatisfied' ? 'no_clock' : 'met';
      fromMeetings = {
        status: result.status,
        deadline: result.deadline,
        clock: { state, deadline: result.deadline, postedAt: result.postedAt, basis },
      };
    }
  }

  return {
    ...row,
    // What the linked file is now, for callers that must tell a saved draft
    // (open it and post it) from a deleted one (upload again) — `status` alone
    // reads both as "not linked". `null` = nothing linked, or the row is gone.
    documentState:
      linked === undefined ? null : linked.deletedAt != null ? 'deleted' : linked.isDraft ? 'draft' : 'posted',
    ...(notices ? { meetingNotices: notices } : {}),
    ...(minutes ? { meetingMinutes: minutes } : {}),
    // A row scored from meetings carries the meetings' deadline. A posted
    // record judged late carries the deadline it missed (#1506). A yearly
    // record out of its window has NO deadline: its stored setup clock is
    // last year's, and every surface reading `deadline` would call it "due"
    // or "Nd overdue". Every other row keeps its stored setup clock.
    ...(fromMeetings
      ? { deadline: fromMeetings.deadline }
      : document.clock.state === 'met_late' && document.status === 'overdue'
        ? { deadline: document.clock.deadline }
        : document.clock.state === 'out_of_window' && document.status === 'unsatisfied'
          ? { deadline: null }
          : {}),
    clock: fromMeetings?.clock ?? document.clock,
    status: fromMeetings?.status ?? document.status,
  };
}

type ComplianceStatusValue = ReturnType<typeof calculateComplianceClock>['status'];
