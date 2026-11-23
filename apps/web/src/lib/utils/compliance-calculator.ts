import { isAfter } from 'date-fns';
import { SEVEN_DAYS_MS } from '@propertypro/shared';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';

/**
 * The clock itself (status, time-left state, rolling windows) lives in
 * `@propertypro/shared` so the admin console scores with the same rule.
 * Re-exported here so existing `@/lib/utils/compliance-calculator` importers
 * keep working. What stays below is the Compliance page's own presentation.
 */
export {
  calculateComplianceClock,
  calculateComplianceStatus,
  calculatePostingDeadline,
  calculateRollingWindowStart,
  LATE_POSTING_COUNTS_MONTHS,
  SEVEN_DAYS_MS,
  YEARLY_RECORD_CYCLE_MONTHS,
  type ChecklistClock,
  type ChecklistClockState,
  type ClockBasis,
  type ComplianceStatus,
  type ComplianceStatusInput,
  type ComplianceStatusResult,
} from '@propertypro/shared';

/**
 * Convenience helper for deadline checks used in tests.
 */
export function isOverdue(deadline: Date, now: Date = new Date()): boolean {
  return isAfter(now, deadline);
}

const CATEGORY_ORDER = ["governing_documents", "financial_records", "meeting_records", "insurance", "operations"];

/**
 * Group items by category in a stable order.
 * Works with any object that has a `category` string property.
 */
export function groupByCategory<T extends { category: string }>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const cat of CATEGORY_ORDER) {
    const matching = items.filter((i) => i.category === cat);
    if (matching.length > 0) grouped.set(cat, matching);
  }
  for (const item of items) {
    if (!grouped.has(item.category)) {
      grouped.set(item.category, items.filter((i) => i.category === item.category));
    }
  }
  return grouped;
}

/**
 * Templates whose status implies the board must act before the item can be satisfied.
 * Maintain as an explicit whitelist; do not derive from a heuristic.
 */
export const BOARD_ACTION_TEMPLATE_KEYS = new Set<string>([
  '718_minutes_rolling_12m',
  '718_affidavits',
  '720_minutes_rolling_12m',
  '720_bids',
]);

/**
 * True when the item should appear in the "Action needed" filter / attention banner.
 * Single predicate: overdue OR (unsatisfied and deadline within 7 days)
 * OR (board-action whitelist and not satisfied/not_applicable).
 */
export function needsAttention(item: ChecklistItemData, now: Date = new Date()): boolean {
  if (item.status === 'overdue') return true;

  // A yearly record over a year old has no deadline to count toward, but a
  // newer one is owed now.
  if (item.status === 'unsatisfied' && item.clock?.state === 'out_of_window') return true;

  if (item.status === 'unsatisfied' && item.deadline) {
    const deadlineMs = new Date(item.deadline).getTime();
    if (deadlineMs - now.getTime() <= SEVEN_DAYS_MS) return true;
  }

  if (
    BOARD_ACTION_TEMPLATE_KEYS.has(item.templateKey) &&
    item.status !== 'satisfied' &&
    item.status !== 'not_applicable'
  ) {
    return true;
  }

  return false;
}

export interface ComplianceSummary {
  readiness: { satisfied: number; applicableTotal: number; percentage: number };
  postingWindowsDueSoonCount: number;
  overdueCount: number;
  needsBoardActionCount: number;
  attentionCount: number;
}

export function buildComplianceSummary(
  items: ChecklistItemData[],
  now: Date = new Date(),
): ComplianceSummary {
  let satisfied = 0;
  let applicableTotal = 0;
  let postingWindowsDueSoonCount = 0;
  let overdueCount = 0;
  let needsBoardActionCount = 0;
  let attentionCount = 0;

  for (const item of items) {
    if (item.status !== 'not_applicable') applicableTotal++;
    if (item.status === 'satisfied') satisfied++;
    if (item.status === 'overdue') overdueCount++;

    if (item.status === 'unsatisfied' && item.deadline) {
      const ms = new Date(item.deadline).getTime() - now.getTime();
      if (ms <= SEVEN_DAYS_MS) postingWindowsDueSoonCount++;
    }

    if (
      BOARD_ACTION_TEMPLATE_KEYS.has(item.templateKey) &&
      item.status !== 'satisfied' &&
      item.status !== 'not_applicable'
    ) {
      needsBoardActionCount++;
    }

    if (needsAttention(item, now)) attentionCount++;
  }

  const percentage = applicableTotal === 0
    ? 100
    : Math.round((satisfied / applicableTotal) * 100);

  return {
    readiness: { satisfied, applicableTotal, percentage },
    postingWindowsDueSoonCount,
    overdueCount,
    needsBoardActionCount,
    attentionCount,
  };
}

function priorityBucket(item: ChecklistItemData): number {
  if (item.status === 'overdue') return 0;
  if (item.status === 'unsatisfied' && item.deadline) return 1;
  if (item.status === 'unsatisfied' && !item.deadline) return 2;
  if (item.status === 'satisfied') return 3;
  return 4; // not_applicable
}

export function sortByPriority(
  items: ChecklistItemData[],
  _now: Date = new Date(),
): ChecklistItemData[] {
  const copy = items.slice();
  copy.sort((a, b) => {
    const ba = priorityBucket(a);
    const bb = priorityBucket(b);
    if (ba !== bb) return ba - bb;

    // Bucket 1: order by deadline ASC.
    if (ba === 1) {
      const da = new Date(a.deadline!).getTime();
      const db = new Date(b.deadline!).getTime();
      if (da !== db) return da - db;
    }

    // All other buckets (and tie-broken bucket 1): order by title ASC.
    const titleCmp = a.title.localeCompare(b.title);
    if (titleCmp !== 0) return titleCmp;

    // Final stable tiebreak: id ASC.
    return a.id - b.id;
  });
  return copy;
}
