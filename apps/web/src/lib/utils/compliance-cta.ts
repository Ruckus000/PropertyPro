import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';

export type ComplianceCtaHandler = 'upload' | 'link' | 'view' | 'mark_applicable';

export interface ComplianceCta {
  label: string;
  handler: ComplianceCtaHandler;
}

/**
 * Resolves the primary CTA for a compliance record based on its status,
 * whether a document is linked, and the user's write capability + role.
 *
 * Returns null when the CTA should be hidden (read-only user with no
 * existing document to view).
 *
 * Shared by ComplianceQueue (row primary action) and ComplianceDetailPanel
 * (side panel CTA) so the two surfaces never drift apart for the same item.
 */
export function resolveComplianceCta(
  item: ChecklistItemData,
  canWrite: boolean,
  role?: string,
): ComplianceCta | null {
  if (!canWrite) {
    return item.documentId ? { label: 'View document', handler: 'view' } : null;
  }
  if (item.status === 'not_applicable') {
    return { label: 'Mark applicable', handler: 'mark_applicable' };
  }
  if (item.status === 'satisfied') {
    return { label: 'View document', handler: 'view' };
  }
  if (item.documentId) {
    const rolling = !!item.rollingWindow;
    return rolling
      ? { label: 'Upload current document', handler: 'upload' }
      : { label: 'Re-link or replace', handler: 'link' };
  }
  if (role === 'board_president' || role === 'board_member') {
    return { label: 'Link existing document', handler: 'link' };
  }
  return { label: 'Upload document', handler: 'upload' };
}
