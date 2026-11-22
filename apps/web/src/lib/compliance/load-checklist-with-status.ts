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
import { listMeetingsForNoticeScoring } from '@/lib/services/meeting-service';
import { calculateRollingWindowStart } from '@/lib/utils/compliance-calculator';
import { withDerivedStatus } from './derive-checklist-status';
import {
  MEETING_NOTICE_TEMPLATE_KEYS,
  MEETING_NOTICE_WINDOW_MONTHS,
  summarizeMeetingNotices,
} from './meeting-notice-status';

export { withDerivedStatus };

/**
 * List the checklist and derive each row's status.
 *
 * Resolves `documents.deleted_at` / draft state for the linked documents so a
 * soft-deleted or draft document does not silently keep its item satisfied.
 * Targeted inArray lookup over just the linked ids — the compliance route is
 * hot, so this must never become a full-table read.
 */
export async function loadChecklistWithStatus(
  communityId: number,
  communityType: CommunityType,
): Promise<Record<string, unknown>[]> {
  const rows = await listComplianceChecklistItems(communityId);
  const linkedDocumentIds = [
    ...new Set(
      rows
        .map((r) => r['documentId'] as number | null)
        .filter((v): v is number => typeof v === 'number'),
    ),
  ];
  const now = new Date();
  // Only a checklist that has a meeting-notice row pays for the meetings read.
  const scoresMeetings = rows.some((r) => MEETING_NOTICE_TEMPLATE_KEYS.has(r['templateKey'] as string));
  const [documentStateById, unitCount, noticeMeetings] = await Promise.all([
    getLinkedDocumentStatesByIds(communityId, linkedDocumentIds),
    getCommunityUnitCount(communityId),
    scoresMeetings
      ? listMeetingsForNoticeScoring(
        communityId,
        calculateRollingWindowStart(now, MEETING_NOTICE_WINDOW_MONTHS),
      )
      : Promise.resolve(null),
  ]);
  const clockApplies = postingClockApplies({ communityType, unitCount });
  const meetingNotices = noticeMeetings
    ? summarizeMeetingNotices(noticeMeetings, communityType, now)
    : null;
  return rows.map((row) =>
    withDerivedStatus(row, documentStateById, clockApplies, meetingNotices, now),
  );
}
