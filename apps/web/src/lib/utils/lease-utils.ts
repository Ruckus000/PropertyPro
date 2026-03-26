import { daysUntilExpiration } from '@/lib/services/lease-expiration-service';
import type { LeaseListItem as LeaseApiItem } from '@/hooks/use-leases';

// ---------------------------------------------------------------------------
// Rent helpers
// ---------------------------------------------------------------------------

/**
 * Format a raw decimal string (e.g. "1500.00") as a display currency string.
 * The schema stores rent as PostgreSQL numeric(10,2) — NO cents conversion.
 * Use this for read-only display only, never for form input values.
 */
export function formatRentDisplay(rentAmount: string | null | undefined): string {
  if (rentAmount === null || rentAmount === undefined) return '—';
  const num = Number(rentAmount);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * Parse a user-typed rent string into a normalised decimal string for the API.
 * Returns null for empty, whitespace-only, negative, or non-numeric input.
 * Zero ($0.00) is intentionally valid — used for concessions and test leases.
 *
 * Accepts: "0", "0.00", "1500", "1500.50"
 * Rejects: "1500abc", "1500.505", "-100", ""
 */
export function parseRentInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const num = parseFloat(trimmed);
  if (num < 0) return null; // unreachable after regex but explicit
  return num.toFixed(2);
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Format a YYYY-MM-DD lease date as "Jan 1, 2026".
 * Parses as UTC midnight to avoid local-timezone shift (same pattern as
 * lease-expiration-service). Returns "Month-to-month" for null.
 */
export function formatLeaseDate(dateStr: string | null): string {
  if (!dateStr) return 'Month-to-month';
  try {
    const d = new Date(dateStr + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Add one calendar day to a YYYY-MM-DD string using UTC arithmetic.
 * Replaces `addDays(parseISO(endDate), 1)` which uses local time and causes
 * off-by-one errors around DST transitions.
 */
export function addOneDayUTC(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export type LeaseDisplayStatus =
  | 'active'
  | 'expiring_soon'
  | 'expired'
  | 'renewed'
  | 'terminated';

/**
 * Compute the UI display status for a lease.
 * Delegates to daysUntilExpiration from lease-expiration-service (UTC-safe).
 * "Expiring Soon" = 0 ≤ days ≤ 60.
 *
 * @param referenceDate - Pin "now" at the top of a render for consistency.
 */
export function getLeaseDisplayStatus(
  lease: LeaseApiItem,
  referenceDate?: Date,
): LeaseDisplayStatus {
  if (lease.status === 'terminated') return 'terminated';
  if (lease.status === 'expired') return 'expired';
  if (lease.status === 'renewed') return 'renewed';
  if (lease.endDate) {
    const days = daysUntilExpiration(lease.endDate, referenceDate ?? new Date());
    if (days !== null && days < 0) return 'expired';
    if (days !== null && days <= 60) return 'expiring_soon';
  }
  return 'active';
}

/**
 * Returns true if the lease ends within the given day window, starting from today.
 * Past-due leases (days < 0) return false — "Expiring Soon" should not include
 * already-expired leases. This differs intentionally from isLeaseExpiringWithinDays()
 * in lease-expiration-service, which treats past-due as "within window" (useful for
 * API filters). The UI tab should only show future expirations.
 */
export function isExpiringWithinWindow(
  endDate: string | null,
  days: number,
  referenceDate?: Date,
): boolean {
  if (!endDate) return false;
  const d = daysUntilExpiration(endDate, referenceDate ?? new Date());
  return d !== null && d >= 0 && d <= days;
}
