// Dependency-free on purpose: route contracts and the assessment cron import
// it, and `@/lib/finance/common` / finance-service pull the DB client (and are
// mocked wholesale by most tests).

/**
 * True iff `value` is a `YYYY-MM-DD` string naming a real calendar date. The
 * shape check alone let `2026-02-31` through to Postgres, whose out-of-range
 * error surfaced as a 500; the round-trip through UTC rejects it (and month 13,
 * day 0, Feb 29 in a common year). Pure, so Zod contracts can `.refine` on it.
 */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * The assessment's start/end bounds, at MONTH granularity and inclusive on both
 * ends: a date is billable iff its month is on or after startDate's month and,
 * when endDate is set, on or before endDate's month. So "starts 2026-04-20"
 * bills April, and "ends 2026-04-01" bills April. One rule, shared by manual
 * generation (generateAssessmentLineItemsForCommunity) and the recurring cron,
 * which passes its period's 1st.
 */
export function assessmentMonthOutOfRange(
  assessment: { startDate: string; endDate: string | null },
  dateOnly: string,
): 'before_start' | 'after_end' | null {
  const month = dateOnly.slice(0, 7);
  if (month < assessment.startDate.slice(0, 7)) return 'before_start';
  if (assessment.endDate && month > assessment.endDate.slice(0, 7)) return 'after_end';
  return null;
}
