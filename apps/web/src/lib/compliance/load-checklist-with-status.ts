/**
 * The compliance checklist with each item's derived status — the one place it
 * is computed, so every surface shows the same score. The compliance route and
 * the welcome page both read it (onboarding audit F8: the welcome page used to
 * count any linked document as satisfied, drafts and deleted ones included,
 * and ignored lateness, so the two disagreed).
 */
import { postingClockApplies, type CommunityType } from '@propertypro/shared';
import { calculateComplianceStatus } from '@/lib/utils/compliance-calculator';
import { getCommunityUnitCount } from '@/lib/services/community-profile-service';
import {
  getLinkedDocumentStatesByIds,
  type LinkedDocumentState,
} from '@/lib/services/documents-service';
import { listComplianceChecklistItems } from '@/lib/services/compliance-service';

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
 */
export function withDerivedStatus(
  storedRow: Record<string, unknown>,
  documentStateById: Map<number, LinkedDocumentState> = new Map(),
  clockApplies = true,
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

  return {
    ...row,
    // What the linked file is now, for callers that must tell a saved draft
    // (open it and post it) from a deleted one (upload again) — `status` alone
    // reads both as "not linked". `null` = nothing linked, or the row is gone.
    documentState:
      linked === undefined ? null : linked.deletedAt != null ? 'deleted' : linked.isDraft ? 'draft' : 'posted',
    status: calculateComplianceStatus({
      isApplicable: row['isApplicable'] as boolean | undefined,
      documentId,
      documentPostedAt,
      documentDeletedAt: linked?.deletedAt ?? null,
      documentIsDraft: linked?.isDraft ?? false,
      deadline,
      rollingWindowMonths,
    }),
  };
}

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
