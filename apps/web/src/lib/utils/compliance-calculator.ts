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
