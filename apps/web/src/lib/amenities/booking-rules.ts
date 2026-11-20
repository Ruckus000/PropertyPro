/**
 * Amenity booking rules: the one place they are checked and described.
 *
 * `amenities.booking_rules` has stored these four limits since the table was
 * created, but until this module nothing enforced them. The reservation
 * service now calls `bookingRuleViolation` before writing, so the rule holds
 * for every client; the manager form and the booking sheet call
 * `describeBookingRules`, so what people read is what the server enforces.
 *
 * Pure: no db, no `Date.now()`. Callers pass `now` and the community's IANA
 * time zone, because blackout dates and "days ahead" are dates on the
 * community's calendar. An unusable zone falls back to the app default rather
 * than failing every booking (`resolveTimezone`).
 */

import { resolveTimezone } from '@/lib/utils/timezone';

export interface BookingRules {
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  advanceBookingDays?: number;
  /** `YYYY-MM-DD` dates on the community's calendar. */
  blackoutDates?: string[];
}

const MINUTE_MS = 60_000;
/** Step used to visit every calendar date a booking touches: half a day, so a 23-hour DST day is never skipped. */
const DATE_STEP_MS = 12 * 60 * MINUTE_MS;

/** "30 minutes", "1 hour", "1.5 hours", "2 hours 15 minutes". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = minutes / 60;
  if (Number.isInteger(hours * 2)) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const whole = Math.floor(hours);
  const rest = minutes - whole * 60;
  return `${whole} hour${whole === 1 ? '' : 's'} ${rest} minute${rest === 1 ? '' : 's'}`;
}

/** "March 3, 2026" for a `YYYY-MM-DD` date, the same in every viewer's zone. */
export function formatCalendarDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }).format(
    new Date(Date.UTC(y!, m! - 1, d!, 12)),
  );
}

/** The `YYYY-MM-DD` date of an instant on a time zone's calendar. */
export function calendarDateIn(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    instant,
  );
}

/** `YYYY-MM-DD` plus `days` calendar days. */
function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** Every calendar date (in `timeZone`) that the half-open range [start, end) touches. */
function datesTouched(start: Date, end: Date, timeZone: string): Set<string> {
  const dates = new Set<string>();
  const last = Math.max(start.getTime(), end.getTime() - 1);
  for (let t = start.getTime(); t < last; t += DATE_STEP_MS) dates.add(calendarDateIn(new Date(t), timeZone));
  dates.add(calendarDateIn(new Date(last), timeZone));
  return dates;
}

/**
 * The first rule a booking breaks, as a sentence a resident can act on, or
 * `null` when it keeps every rule. Order: duration, how far ahead, blackouts.
 */
export function bookingRuleViolation(
  rules: BookingRules,
  start: Date,
  end: Date,
  now: Date,
  zone: string,
): string | null {
  const timeZone = resolveTimezone(zone);
  const minutes = (end.getTime() - start.getTime()) / MINUTE_MS;

  if (rules.minDurationMinutes !== undefined && minutes < rules.minDurationMinutes) {
    return `Bookings for this amenity must be at least ${formatMinutes(rules.minDurationMinutes)}.`;
  }
  if (rules.maxDurationMinutes !== undefined && minutes > rules.maxDurationMinutes) {
    return `Bookings for this amenity can be at most ${formatMinutes(rules.maxDurationMinutes)}.`;
  }
  // Calendar days, as residents read "Book up to 7 days ahead": any time on the 7th day counts.
  if (
    rules.advanceBookingDays !== undefined
    && calendarDateIn(start, timeZone) > addCalendarDays(calendarDateIn(now, timeZone), rules.advanceBookingDays)
  ) {
    const days = rules.advanceBookingDays;
    return `This amenity can be booked at most ${days} day${days === 1 ? '' : 's'} ahead.`;
  }
  if (rules.blackoutDates && rules.blackoutDates.length > 0) {
    const closed = new Set(rules.blackoutDates);
    const hit = [...datesTouched(start, end, timeZone)].sort().find((date) => closed.has(date));
    if (hit) return `This amenity is closed on ${formatCalendarDate(hit)}.`;
  }
  return null;
}

/** Short lines for the booking sheet and the amenity list, e.g. "1 hour to 4 hours per booking". */
export function describeBookingRules(rules: BookingRules): string[] {
  const lines: string[] = [];
  const { minDurationMinutes: min, maxDurationMinutes: max, advanceBookingDays: days, blackoutDates } = rules;
  if (min !== undefined && max !== undefined) lines.push(`${formatMinutes(min)} to ${formatMinutes(max)} per booking`);
  else if (min !== undefined) lines.push(`At least ${formatMinutes(min)} per booking`);
  else if (max !== undefined) lines.push(`Up to ${formatMinutes(max)} per booking`);
  if (days !== undefined) lines.push(`Book up to ${days} day${days === 1 ? '' : 's'} ahead`);
  if (blackoutDates && blackoutDates.length > 0) {
    lines.push(`Closed on ${[...blackoutDates].sort().map(formatCalendarDate).join(', ')}`);
  }
  return lines;
}
