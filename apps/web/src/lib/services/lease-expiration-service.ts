/**
 * Lease Expiration Service — P2-37
 *
 * Provides utility functions for lease expiration detection and renewal chain
 * traversal. Uses date-fns for all date arithmetic (AGENTS #16-17).
 *
 * Key design decisions:
 * - Month-to-month leases (endDate = null) never expire
 * - All date comparisons use UTC (AGENTS #16: dates stored UTC)
 * - DST transitions are handled by date-fns addDays (not manual ms arithmetic)
 * - Date-only strings (YYYY-MM-DD) are parsed as UTC midnight to avoid
 *   timezone shift issues with date-fns parseISO (which returns local time)
 */
import { addDays, differenceInCalendarDays } from 'date-fns';

export interface LeaseRecord {
  id: number;
  communityId: number;
  unitId: number;
  residentId: string;
  startDate: string;
  endDate: string | null;
  rentAmount: string | null;
  status: string;
  previousLeaseId: number | null;
  notes: string | null;
}

export interface ExpiringLease extends LeaseRecord {
  /** Number of calendar days until expiration (0 = expires today, negative = already past) */
  daysUntilExpiration: number;
}

/**
 * Parse a YYYY-MM-DD date string as UTC midnight.
 *
 * date-fns parseISO returns local-time midnight for date-only strings,
 * which causes off-by-one errors when compared against UTC reference dates.
 * This helper ensures consistent UTC parsing.
 */
function parseDateUTC(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return null;
  }
  const d = new Date(dateStr + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d;
}

/**
 * Normalize a reference Date to UTC midnight for consistent calendar-day
 * comparison with date-only lease end dates.
 */
function toUTCMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Determine whether a lease is expiring within the given window.
 *
 * A lease "expires within N days" if its endDate falls on or before
 * referenceDate + N calendar days (inclusive boundary).
 *
 * @param endDate - The lease end date as YYYY-MM-DD string, or null for month-to-month
 * @param referenceDate - The "now" reference date (UTC)
 * @param daysWindow - Number of days to look ahead (e.g., 30, 60, 90)
 * @returns true if the lease expires within the window, false otherwise
 *
 * Edge cases handled:
 * - null endDate (month-to-month) => never expires => false
 * - endDate in the past => already expired => true (within any window)
 * - DST transitions => date-fns addDays handles correctly
 * - Leap year boundaries => date-fns handles correctly
 */
export function isLeaseExpiringWithinDays(
  endDate: string | null,
  referenceDate: Date,
  daysWindow: number,
): boolean {
  if (endDate === null) {
    // Month-to-month: never expires
    return false;
  }

  const parsedEnd = parseDateUTC(endDate);
  if (parsedEnd === null) {
    return false;
  }

  const refMidnight = toUTCMidnight(referenceDate);
  const windowEnd = addDays(refMidnight, daysWindow);
  // Lease expires within window if endDate <= windowEnd (inclusive)
  return parsedEnd.getTime() <= windowEnd.getTime();
}

/**
 * Calculate days until a lease expires relative to a reference date.
 *
 * @param endDate - Lease end date as YYYY-MM-DD string
 * @param referenceDate - "Now" reference date
 * @returns Number of calendar days until expiration. Negative if already past.
 *          null if endDate is null (month-to-month).
 */
export function daysUntilExpiration(
  endDate: string | null,
  referenceDate: Date,
): number | null {
  if (endDate === null) {
    return null;
  }

  const parsedEnd = parseDateUTC(endDate);
  if (parsedEnd === null) {
    return null;
  }

  const refMidnight = toUTCMidnight(referenceDate);
  return differenceInCalendarDays(parsedEnd, refMidnight);
}

/**
 * Filter leases to those expiring within a given window.
 * Only considers active leases with a non-null endDate.
 *
 * @param allLeases - All lease records for a community
 * @param daysWindow - Days ahead to check (e.g., 30, 60, 90)
 * @param referenceDate - Optional "now" override for testing (defaults to new Date())
 * @returns Leases expiring within the window, with daysUntilExpiration attached
 */
export function getExpiringLeases(
  allLeases: LeaseRecord[],
  daysWindow: number,
  referenceDate?: Date,
): ExpiringLease[] {
  const now = referenceDate ?? new Date();

  return allLeases
    .filter((lease) => {
      // Only active leases with definite end dates can "expire"
      if (lease.status !== 'active') return false;
      if (lease.endDate === null) return false;
      return isLeaseExpiringWithinDays(lease.endDate, now, daysWindow);
    })
    .map((lease) => ({
      ...lease,
      daysUntilExpiration: daysUntilExpiration(lease.endDate, now) ?? 0,
    }))
    .sort((a, b) => a.daysUntilExpiration - b.daysUntilExpiration);
}

/**
 * Build the renewal chain for a given lease by following previousLeaseId links.
 * Returns the chain from oldest to newest (the given lease is last).
 *
 * @param leaseId - The lease to trace back from
 * @param allLeases - All leases in the community (scoped query result)
 * @returns Ordered array of leases from original to current
 */
export function getRenewalChain(
  leaseId: number,
  allLeases: LeaseRecord[],
): LeaseRecord[] {
  const byId = new Map<number, LeaseRecord>();
  for (const lease of allLeases) {
    byId.set(lease.id, lease);
  }

  const chain: LeaseRecord[] = [];
  let current = byId.get(leaseId);

  // Guard against circular references
  const visited = new Set<number>();

  while (current) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    chain.unshift(current);

    if (current.previousLeaseId !== null) {
      current = byId.get(current.previousLeaseId);
    } else {
      break;
    }
  }

  return chain;
}
