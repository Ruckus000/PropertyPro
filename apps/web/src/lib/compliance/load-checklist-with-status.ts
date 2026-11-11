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
import { withDerivedStatus } from './derive-checklist-status';

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
  const documentStateById = await getLinkedDocumentStatesByIds(communityId, linkedDocumentIds);
  const clockApplies = postingClockApplies({
    communityType,
    unitCount: await getCommunityUnitCount(communityId),
  });
  return rows.map((row) => withDerivedStatus(row, documentStateById, clockApplies));
}
