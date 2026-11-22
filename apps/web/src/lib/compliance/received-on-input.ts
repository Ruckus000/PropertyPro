/**
 * Turning the "Received or created on" date a manager picks into the instant
 * the server stores (`documents.received_at`).
 *
 * A calendar date carries no time, so it becomes the LAST moment of that day
 * in the viewer's clock: a record received that day and posted on day 30 is
 * never called late because of a time nobody entered. Today becomes the
 * current moment, which is the same day and never in the future.
 */

/** `YYYY-MM-DD` for a moment, in the viewer's clock: the date input's value. */
export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * The ISO instant for a picked date, or `null` for an empty or unreadable
 * value, or a date after today.
 */
export function receivedOnToIso(value: string, now: Date = new Date()): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const endOfDay = new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
  if (Number.isNaN(endOfDay.getTime()) || toDateInputValue(endOfDay) !== value) return null;
  const today = toDateInputValue(now);
  if (value > today) return null;
  return value === today ? now.toISOString() : endOfDay.toISOString();
}
