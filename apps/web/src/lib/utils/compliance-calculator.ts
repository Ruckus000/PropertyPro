import {
  addDays,
  addMonths,
  isAfter,
  isBefore,
  isWeekend,
  nextMonday,
  startOfDay,
} from 'date-fns';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';

export type ComplianceStatus = 'satisfied' | 'unsatisfied' | 'overdue' | 'not_applicable';

export interface ComplianceStatusInput {
  isApplicable?: boolean;
  documentId?: number | null;
  documentPostedAt?: Date | null;
  deadline?: Date | null;
  rollingWindowMonths?: number | null;
  now?: Date;
}

/**
 * Business rule: deadlines that land on weekends roll forward to Monday.
 */
function adjustWeekendDeadline(deadline: Date): Date {
  const dayStart = startOfDay(deadline);
  if (!isWeekend(dayStart)) {
    return deadline;
  }

  const monday = nextMonday(dayStart);
  return monday;
}

/**
 * Calculate posting deadline from a source date (default 30 days),
 * with weekend rollover handling.
 */
export function calculatePostingDeadline(sourceDate: Date, days: number = 30): Date {
  const raw = addDays(sourceDate, days);
  return adjustWeekendDeadline(raw);
}

/**
 * Rolling window start boundary for compliance checks.
 */
export function calculateRollingWindowStart(referenceDate: Date, months: number = 12): Date {
  return addMonths(referenceDate, -months);
}

/**
 * Compute the checklist status at query-time.
 */
export function calculateComplianceStatus(input: ComplianceStatusInput): ComplianceStatus {
  const now = input.now ?? new Date();

  if (input.isApplicable === false) {
    return 'not_applicable';
  }

  if (input.documentId != null) {
    if (input.rollingWindowMonths && input.documentPostedAt) {
      const windowStart = calculateRollingWindowStart(now, input.rollingWindowMonths);
      if (isBefore(input.documentPostedAt, windowStart)) {
        return 'overdue';
      }
    }

    return 'satisfied';
  }

  if (input.deadline && isAfter(now, input.deadline)) {
    return 'overdue';
  }

  return 'unsatisfied';
}

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

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * True when the item should appear in the "Action needed" filter / attention banner.
 * Single predicate: overdue OR (unsatisfied and deadline within 7 days)
 * OR (board-action whitelist and not satisfied/not_applicable).
 */
export function needsAttention(item: ChecklistItemData, now: Date = new Date()): boolean {
  if (item.status === 'overdue') return true;

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
