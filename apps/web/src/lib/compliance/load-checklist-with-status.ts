/**
 * The compliance checklist with each item's derived status — the one place it
 * is computed, so every surface shows the same score. The compliance route and
 * the welcome page both read it (onboarding audit F8: the welcome page used to
 * count any linked document as satisfied, drafts and deleted ones included,
 * and ignored lateness, so the two disagreed).
 */
import { postingClockApplies, type CommunityType } from '@propertypro/shared';
import { getCommunityUnitCount } from '@/lib/services/community-profile-service';
import {
  getLinkedDocumentStatesByIds,
  type LinkedDocumentState,
} from '@/lib/services/documents-service';
import { listComplianceChecklistItems } from '@/lib/services/compliance-service';
import { listMeetingsForComplianceScoring } from '@/lib/services/meeting-service';
import { calculateRollingWindowStart } from '@/lib/utils/compliance-calculator';
import { withDerivedStatus, type MeetingScoring } from './derive-checklist-status';
import { MEETING_NOTICE_TEMPLATE_KEYS, summarizeMeetingNotices } from './meeting-notice-status';
import {
  MEETING_MINUTES_TEMPLATE_KEYS,
  MEETING_SCORING_WINDOW_MONTHS,
  minutesDocumentIds,
  summarizeMeetingMinutes,
  toMinutesInputs,
} from './meeting-minutes-status';

export { withDerivedStatus };

/**
 * Add the states of minutes documents not already read for the checklist.
 * Usually none are missing (a board's newest minutes are also the minutes
 * row's file), so this is usually no query at all.
 */
export async function withMinutesDocumentStates(
  communityId: number,
  states: Map<number, LinkedDocumentState>,
  minutesIds: readonly number[],
): Promise<Map<number, LinkedDocumentState>> {
  const missing = [...new Set(minutesIds)].filter((id) => !states.has(id));
  if (missing.length === 0) return states;
  const more = await getLinkedDocumentStatesByIds(communityId, missing);
  return new Map([...states, ...more]);
}


/**
 * List the checklist and derive each row's status.
 *
 * Resolves `documents.deleted_at` / draft state / posted and received dates
 * for the linked documents — and for the minutes documents the board meetings
 * name — so a soft-deleted or draft document does not silently keep its item
 * satisfied, and each record is judged against its own 30-day clock. Targeted
 * inArray lookup over just those ids — the compliance route is hot, so this
 * must never become a full-table read.
 */
export async function loadChecklistWithStatus(
  communityId: number,
  communityType: CommunityType,
): Promise<Record<string, unknown>[]> {
  const rows = await listComplianceChecklistItems(communityId);
  const linkedDocumentIds = rows
    .map((r) => r['documentId'] as number | null)
    .filter((v): v is number => typeof v === 'number');
  const now = new Date();
  // Only a checklist that has a meeting-notice or minutes row pays for the
  // meetings read.
  const scoresNotices = rows.some((r) => MEETING_NOTICE_TEMPLATE_KEYS.has(r['templateKey'] as string));
  const scoresMinutes = rows.some((r) => MEETING_MINUTES_TEMPLATE_KEYS.has(r['templateKey'] as string));
  const [linkedStates, unitCount, scoringMeetings] = await Promise.all([
    getLinkedDocumentStatesByIds(communityId, [...new Set(linkedDocumentIds)]),
    getCommunityUnitCount(communityId),
    scoresNotices || scoresMinutes
      ? listMeetingsForComplianceScoring(
        communityId,
        calculateRollingWindowStart(now, MEETING_SCORING_WINDOW_MONTHS),
      )
      : Promise.resolve(null),
  ]);
  const documentStateById = await withMinutesDocumentStates(
    communityId,
    linkedStates,
    minutesDocumentIds(scoringMeetings ?? []),
  );
  const clockApplies = postingClockApplies({ communityType, unitCount });
  const meetings: MeetingScoring | null = scoringMeetings
    ? {
      notices: scoresNotices ? summarizeMeetingNotices(scoringMeetings, communityType, now) : null,
      minutes: scoresMinutes
        ? summarizeMeetingMinutes(toMinutesInputs(scoringMeetings, documentStateById), now)
        : null,
    }
    : null;
  return rows.map((row) =>
    withDerivedStatus(row, documentStateById, clockApplies, meetings, now),
  );
}
