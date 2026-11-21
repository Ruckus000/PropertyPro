/**
 * The pure half of the compliance loader: one checklist row in, the same row
 * with its derived status out. Kept free of service imports so callers that
 * read checklist rows in bulk (the PM Communities summary) can apply the very
 * same rule without loading the per-community services.
 */
import { calculateComplianceStatus } from '@/lib/utils/compliance-calculator';
import type { LinkedDocumentState } from '@/lib/services/documents-service';
import {
  MEETING_NOTICE_TEMPLATE_KEYS,
  meetingNoticeStatus,
  type MeetingNoticeSummary,
} from './meeting-notice-status';

/**
 * Decorate a checklist row with its derived compliance status.
 *
 * `documentStateById` maps a linked document id to whether it is deleted or a
 * draft. Neither may keep the item satisfied, so both are threaded into the
 * calculator.
 *
 * Below the website rule's size threshold (`postingClockApplies` false) the row
 * goes out without its posting clock — no deadline, no rolling window — so it
 * can be posted or not, but never overdue or "due soon" anywhere it is shown.
 *
 * `meetingNotices` is the community's per-meeting notice summary. On a
 * meeting-notice row it decides the status (`meetingNoticeStatus`) and rides
 * along as `meetingNotices`, so the UI can name the meeting. When the meetings
 * say nothing yet, the row keeps its document-based status. Ignored on every
 * other row, on a row marked "doesn't apply", and below the size threshold.
 */
export function withDerivedStatus(
  storedRow: Record<string, unknown>,
  documentStateById: Map<number, LinkedDocumentState> = new Map(),
  clockApplies = true,
  meetingNotices: MeetingNoticeSummary | null = null,
  now: Date = new Date(),
): Record<string, unknown> {
  const row = clockApplies ? storedRow : { ...storedRow, deadline: null, rollingWindow: null };
  const deadline = row['deadline'] ? new Date(row['deadline'] as string) : null;
  const documentPostedAt = row['documentPostedAt']
    ? new Date(row['documentPostedAt'] as string)
    : null;

  const rollingWindowRecord = row['rollingWindow'] as Record<string, unknown> | null;
  const rollingWindowMonths =
    typeof rollingWindowRecord?.months === 'number' ? rollingWindowRecord.months : null;

  const documentId = (row['documentId'] as number | null) ?? null;
  const linked = documentId != null ? documentStateById.get(documentId) : undefined;

  const documentStatus = calculateComplianceStatus({
    isApplicable: row['isApplicable'] as boolean | undefined,
    documentId,
    documentPostedAt,
    documentDeletedAt: linked?.deletedAt ?? null,
    documentIsDraft: linked?.isDraft ?? false,
    deadline,
    rollingWindowMonths,
    now,
  });

  const scoresMeetings =
    meetingNotices !== null &&
    clockApplies &&
    documentStatus !== 'not_applicable' &&
    MEETING_NOTICE_TEMPLATE_KEYS.has(row['templateKey'] as string);
  const fromMeetings = scoresMeetings && meetingNotices ? meetingNoticeStatus(meetingNotices, now) : null;

  return {
    ...row,
    // What the linked file is now, for callers that must tell a saved draft
    // (open it and post it) from a deleted one (upload again) — `status` alone
    // reads both as "not linked". `null` = nothing linked, or the row is gone.
    documentState:
      linked === undefined ? null : linked.deletedAt != null ? 'deleted' : linked.isDraft ? 'draft' : 'posted',
    ...(scoresMeetings ? { meetingNotices } : {}),
    ...(fromMeetings ? { deadline: fromMeetings.deadline } : {}),
    status: fromMeetings?.status ?? documentStatus,
  };
}
