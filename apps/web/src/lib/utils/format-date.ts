/**
 * Canonical date formatting utilities.
 *
 * All UI-facing date rendering should go through these helpers so the format
 * is consistent across mobile and desktop surfaces.
 */

const SHORT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

/**
 * Format an ISO date string or Date to "Jan 1, 2025" (en-US locale).
 * Pass a timezone string (IANA) to localize; omit for UTC display.
 */
export function formatShortDate(value: string | Date, timeZone?: string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString('en-US', {
    ...SHORT_DATE_FORMAT,
    ...(timeZone ? { timeZone } : {}),
  });
}

/**
 * Format a date-only string like "2025-01-15" without UTC offset shifts.
 * Use this for due dates, effective dates, and other date-only fields.
 */
export function formatDateOnly(value: string): string {
  return new Date(value + 'T00:00:00').toLocaleDateString('en-US', SHORT_DATE_FORMAT);
}
