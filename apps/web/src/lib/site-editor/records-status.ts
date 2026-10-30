/**
 * The website's official-records status (website builder v4, Phase 6): one
 * status per group of official records, read off the compliance checklist.
 *
 * Deliberately NOT a second computation of what is "required". The checklist
 * already knows which items apply, which are conditional, and — since #1268 —
 * that below the website rule's size threshold nothing is ever overdue. This
 * only groups its verdicts the way the Compliance page does
 * (`compliance-calculator.ts` CATEGORY_ORDER) and names them in the editor's
 * words.
 */
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';
import { requirementLevel, type ComplianceSubject } from '@propertypro/shared';
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

const GROUPS = [
  { category: 'governing_documents', label: 'Governing documents' },
  { category: 'financial_records', label: 'Financial records' },
  { category: 'meeting_records', label: 'Meeting records' },
  { category: 'insurance', label: 'Insurance' },
  { category: 'operations', label: 'Contracts and inspections' },
] as const;

type RecordGroupCategory = (typeof GROUPS)[number]['category'];

/**
 * The name of each group of official records, keyed by the checklist category
 * that feeds it, in the order the groups are listed. Built from `GROUPS`, which
 * stays the single source: the editor and the public Documents section name
 * the same groups the same way (`Object.keys` follows `GROUPS`).
 */
export const RECORD_GROUP_LABELS: Readonly<Record<RecordGroupCategory, string>> = Object.freeze(
  Object.fromEntries(GROUPS.map(({ category, label }) => [category, label])) as Record<
    RecordGroupCategory,
    string
  >,
);

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

export interface MissingRecord {
  itemId: number;
  templateKey: string;
  title: string;
  category: string;
  /** Never `up_to_date`: that is the one state that is not missing. */
  state: Exclude<RecordsStatus, 'up_to_date'>;
}

function toMissing(item: ChecklistItemData, state: MissingRecord['state']): MissingRecord {
  return {
    itemId: item.id,
    templateKey: item.templateKey,
    title: item.title,
    category: item.category,
    state,
  };
}

/**
 * The records a covered association still owes the website: applicable items
 * whose record is not up and current. A conditional item is owed once it has a
 * record (a draft, or a posted file that has gone out of date), as
 * `summarizeRecords` counts it; with no record it is a question for
 * `conditionalRecordItems` instead. Empty below the statute's size threshold
 * and for apartments, where nothing is owed.
 *
 * The state is the same one `summarizeRecords` reads off the loader's derived
 * status, so a link to a draft or a deleted file is `not_posted` /
 * `nothing_posted`, never counted as posted.
 */
export function missingRecordItems(
  items: readonly ChecklistItemData[],
  subject: ComplianceSubject,
): MissingRecord[] {
  if (requirementLevel(subject) !== 'required') return [];
  return items.flatMap((item) => {
    if (item.isApplicable === false || (item.isConditional && !hasRecord(item))) return [];
    const state = itemStatus(item);
    return state === 'up_to_date' ? [] : [toMissing(item, state)];
  });
}

/**
 * Conditional items (a SIRS, video recordings) that have no record yet: the
 * ones to ask "does this apply to you?" about, rather than call missing.
 */
export function conditionalRecordItems(
  items: readonly ChecklistItemData[],
  subject: ComplianceSubject,
): MissingRecord[] {
  if (requirementLevel(subject) !== 'required') return [];
  return items.flatMap((item) => {
    if (item.isApplicable === false || !item.isConditional) return [];
    if (hasRecord(item) || item.status === 'satisfied') return [];
    return [toMissing(item, 'nothing_posted')];
  });
}

/**
 * Items whose record was linked by automatic matching and still is, and whose
 * document is still posted. A manual relink moves `documentId` and leaves
 * `autoLinkedDocumentId` behind. The null check comes first: two nulls are
 * equal. A document since taken back to a draft or deleted is listed as missing
 * (`missingRecordItems`), so it is not counted here as well.
 */
export function autoLinkedRecordCount(items: readonly ChecklistItemData[]): number {
  return items.filter(
    (item) =>
      item.autoLinkedDocumentId != null &&
      item.documentId === item.autoLinkedDocumentId &&
      item.documentState === 'posted',
  ).length;
}

/** The pill's "9 of 12 posted": records on the website and current, over all owed. */
export function recordsPostedTotals(items: readonly ChecklistItemData[]): {
  posted: number;
  total: number;
} {
  const groups = summarizeRecords(items);
  return {
    posted: groups.reduce((n, g) => n + g.satisfied, 0),
    total: groups.reduce((n, g) => n + g.total, 0),
  };
}
