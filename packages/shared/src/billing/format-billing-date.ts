/**
 * Format a billing date as "Month D, YYYY" in UTC.
 *
 * Shared so that in-app billing banners and the dunning emails always render the
 * exact same "access until" date. The paid-grace lock boundary is a UTC
 * millisecond calculation (`paidGraceEndsAt`), so the human-readable date must be
 * UTC too — otherwise a viewer in a negative-offset timezone can see the banner
 * say one day and the email say the next.
 */
export function formatBillingDateUTC(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const MS_PER_DAY = 86_400_000;

function utcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Whole UTC calendar days remaining until `periodEnd`, floored at 0.
 *
 * Used by the trial banner so its "N days left" countdown is computed on the
 * same UTC calendar as the displayed period-end date — avoiding an off-by-one
 * for viewers in negative-offset timezones near a day boundary.
 */
export function billingDaysRemainingUTC(periodEnd: Date, now: Date = new Date()): number {
  const diff = Math.round((utcMidnight(periodEnd) - utcMidnight(now)) / MS_PER_DAY);
  return Math.max(0, diff);
}
