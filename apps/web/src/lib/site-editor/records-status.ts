/**
 * The website editor's Documents tool (website builder v4, Phase 6): one status
 * per group of official records, read off the compliance checklist.
 *
 * Deliberately NOT a second computation of what is "required". The checklist
 * already knows which items apply, which are conditional, and — since #1268 —
 * that below the website rule's size threshold nothing is ever overdue. This
 * only groups its verdicts the way the Compliance page does
 * (`compliance-calculator.ts` CATEGORY_ORDER) and names them in the editor's
 * words.
 */
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';
import { calculateRollingWindowStart } from '@/lib/utils/compliance-calculator';

export type RecordsStatus = 'nothing_posted' | 'not_posted' | 'out_of_date' | 'up_to_date';

export interface RecordsGroup {
  category: string;
  label: string;
  status: RecordsStatus;
  /** Applicable items whose record is on the website and current. */
  satisfied: number;
  /** Applicable items in the group (conditional ones only once they have a record). */
  total: number;
  /** A draft behind a "not posted" group, to open directly. */
  draftDocumentId: number | null;
}

const GROUPS: readonly { category: string; label: string }[] = [
  { category: 'governing_documents', label: 'Governing documents' },
  { category: 'financial_records', label: 'Financial records' },
  { category: 'meeting_records', label: 'Meeting records' },
  { category: 'insurance', label: 'Insurance' },
  { category: 'operations', label: 'Contracts and inspections' },
];

/** Worst first, so a group shows its most urgent problem. */
const SEVERITY: Record<RecordsStatus, number> = {
  nothing_posted: 3,
  not_posted: 2,
  out_of_date: 1,
  up_to_date: 0,
};

function itemStatus(item: ChecklistItemData): RecordsStatus {
  if (item.status === 'satisfied' || item.status === 'not_applicable') return 'up_to_date';
  // A saved draft is the same next step whatever the clock says: post it.
  if (item.documentState === 'draft') return 'not_posted';
  if (item.documentState === 'posted') {
    // Posted, yet overdue: either the rolling window has passed (a newer record
    // is owed) or it went up after its deadline. Only the first is something
    // to do now; a late posting is still on the website.
    const stale =
      item.rollingWindow != null &&
      item.documentPostedAt != null &&
      new Date(item.documentPostedAt) <
        calculateRollingWindowStart(new Date(), item.rollingWindow.months);
    return stale ? 'out_of_date' : 'up_to_date';
  }
  // Nothing linked, or the linked file was deleted.
  return 'nothing_posted';
}

/** Whether an item has a file the manager can still act on. */
function hasRecord(item: ChecklistItemData): boolean {
  return item.documentState === 'posted' || item.documentState === 'draft';
}

export function summarizeRecords(items: readonly ChecklistItemData[]): RecordsGroup[] {
  return GROUPS.flatMap(({ category, label }) => {
    const applicable = items.filter(
      (item) =>
        item.category === category &&
        item.isApplicable !== false &&
        // A conditional item (a SIRS, video recordings) is only owed when it
        // applies; with no record, it is not counted against the group.
        !(item.isConditional && !hasRecord(item) && item.status !== 'satisfied'),
    );
    if (applicable.length === 0) return [];
    const statuses = applicable.map((item) => ({ item, status: itemStatus(item) }));
    const status = statuses.reduce<RecordsStatus>(
      (worst, s) => (SEVERITY[s.status] > SEVERITY[worst] ? s.status : worst),
      'up_to_date',
    );
    const draft = statuses.find((s) => s.status === 'not_posted');
    return [
      {
        category,
        label,
        status,
        satisfied: statuses.filter((s) => s.status === 'up_to_date').length,
        total: applicable.length,
        draftDocumentId: status === 'not_posted' ? (draft?.item.documentId ?? null) : null,
      },
    ];
  });
}

/** How many groups are not up to date — the Documents tool's badge. */
export function recordsNeedingAttention(groups: readonly RecordsGroup[]): number {
  return groups.filter((g) => g.status !== 'up_to_date').length;
}
