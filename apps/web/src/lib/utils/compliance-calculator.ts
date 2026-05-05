import {
  addDays,
  addMonths,
  isAfter,
  isBefore,
  isWeekend,
  nextMonday,
  startOfDay,
} from 'date-fns';

export type ComplianceStatus = 'satisfied' | 'unsatisfied' | 'overdue' | 'not_applicable';

export interface ComplianceStatusInput {
  isApplicable?: boolean;
  documentId?: number | null;
  /**
   * Timestamp the linked document was attached to this checklist item.
   * Compared against `deadline` to detect a late posting.
   */
  documentPostedAt?: Date | null;
  /**
   * If the linked document was soft-deleted, this is the document's
   * `deleted_at` timestamp. The calculator treats a deleted document as
   * if the item were unlinked (defense-in-depth — the canonical fix is
   * to null out the FK on document soft-delete, but a race during read
   * is still possible).
   */
  documentDeletedAt?: Date | null;
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

  // A soft-deleted document cannot satisfy a checklist item. Treat as if
  // the FK had been cleared (the canonical fix is to null out the FK in
  // the same transaction as the document soft-delete; this branch is the
  // read-time defense-in-depth check).
  const documentEffectivelyLinked =
    input.documentId != null && input.documentDeletedAt == null;

  if (documentEffectivelyLinked) {
    if (input.rollingWindowMonths && input.documentPostedAt) {
      const windowStart = calculateRollingWindowStart(now, input.rollingWindowMonths);
      if (isBefore(input.documentPostedAt, windowStart)) {
        return 'overdue';
      }
    }

    // A document posted past its deadline does not retroactively satisfy
    // the item — surface as overdue so admins still see the compliance gap.
    if (
      input.deadline &&
      input.documentPostedAt &&
      isAfter(input.documentPostedAt, input.deadline)
    ) {
      return 'overdue';
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
