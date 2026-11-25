/**
 * Rules and wording the contract form and the contracts API share, so a value
 * the form accepts is one the server accepts and both refuse in the same words.
 * Pure: no database, no React.
 */
import type { StatusGlyphKind } from '@propertypro/ui/components/shared/status-glyph';
import { resolveTimezone } from '@/lib/utils/timezone';

export const CONTRACT_STATUSES = ['draft', 'active', 'expired', 'terminated'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** The word and mark for each status. Status is never colour alone. */
export const CONTRACT_STATUS: Record<ContractStatus, { word: string; kind: StatusGlyphKind }> = {
  draft: { word: 'Draft', kind: 'not-started' },
  active: { word: 'Active', kind: 'done' },
  expired: { word: 'Expired', kind: 'overdue' },
  terminated: { word: 'Terminated', kind: 'attention' },
};

/** A stored status as its word and mark; an unknown value is shown as written. */
export function contractStatus(status: string): { word: string; kind: StatusGlyphKind } {
  return CONTRACT_STATUS[status as ContractStatus] ?? { word: status, kind: 'not-started' };
}

/** Digits, optionally a point and one or two more. */
const AMOUNT_SHAPE = /^(\d+)(\.\d{1,2})?$/;
/** The column is numeric(12,2): ten digits before the point, and no more. */
const AMOUNT_MAX_WHOLE_DIGITS = 10;

export const CONTRACT_AMOUNT_MESSAGE =
  'Enter a plain amount with no commas or symbols, for example 12500 or 12500.00.';
export const CONTRACT_AMOUNT_TOO_LARGE_MESSAGE =
  'Enter an amount under 10 billion dollars (at most 10 digits before the decimal point).';

export const CONTRACT_END_BEFORE_START_MESSAGE = 'The end date cannot be before the start date.';
export const CONTRACT_TITLE_REQUIRED_MESSAGE = 'Enter a title.';
export const CONTRACT_VENDOR_REQUIRED_MESSAGE = 'Enter the vendor name.';
export const CONTRACT_CLOSING_TIME_MESSAGE = 'Enter a valid date and time for when bidding closes.';

/**
 * What is wrong with an amount as the API must store it, or null. Strict: an
 * empty string is not an amount. The server schemas use this, so the form and
 * the API cannot disagree.
 */
export function contractAmountIssue(raw: string): string | null {
  const match = AMOUNT_SHAPE.exec(raw);
  if (!match) return CONTRACT_AMOUNT_MESSAGE;
  return match[1]!.length > AMOUNT_MAX_WHOLE_DIGITS ? CONTRACT_AMOUNT_TOO_LARGE_MESSAGE : null;
}

/** The same check for a form field, where empty means "no amount" and is not an error. */
export function contractAmountError(raw: string): string | null {
  return raw === '' ? null : contractAmountIssue(raw);
}

/** Both are 'YYYY-MM-DD', which sorts as text. An open-ended contract has no end to compare. */
export function isEndBeforeStart(startDate: string, endDate: string | null | undefined): boolean {
  if (!endDate || !startDate) return false;
  return endDate < startDate;
}

/** `"2026-12-12"` → `"Dec 12, 2026"`. A calendar date, so no time zone is applied. */
export function formatContractDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * `"Dec 12, 2026, 5:00 PM EST"` in the community's time zone. A stored zone
 * that `Intl` does not know falls back (`resolveTimezone`) and does not throw.
 */
export function formatContractDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: resolveTimezone(timeZone),
  }).format(new Date(iso));
}

/** The calendar date ('YYYY-MM-DD') it is now in `timeZone`: the community's today. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  // en-CA prints a date as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: resolveTimezone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** How long until `endDate`, counted in calendar days from `today` (both 'YYYY-MM-DD'). */
export function contractTimeLeft(endDate: string, today: string): string {
  // Midnight UTC on both sides: a difference of calendar days, with no DST hour in it.
  const days = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return 'Ends today';
  if (days < 0) return days === -1 ? 'Ended 1 day ago' : `Ended ${-days} days ago`;
  if (days === 1) return '1 day left';
  if (days <= 90) return `${days} days left`;
  const months = Math.floor(days / 30);
  return months < 24 ? `${months} months left` : `${Math.floor(days / 365)} years left`;
}

/** "3 sealed" while bidding is open; "3 bids" (or "1 bid", "No bids") once it is not. */
export function bidCountLabel(bidCount: number, sealed: boolean): string {
  if (sealed) return `${bidCount} sealed`;
  if (bidCount === 0) return 'No bids';
  return bidCount === 1 ? '1 bid' : `${bidCount} bids`;
}
