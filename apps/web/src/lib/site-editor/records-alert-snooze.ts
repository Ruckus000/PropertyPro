/**
 * A manager's snooze of the website's missing-records alert (D11): a
 * `user_preferences` row per user and community, `{ snoozedUntil }`.
 *
 * Shared by the route that writes it (`/api/v1/pm/site/records-alert`) and the
 * website home's loader that reads it, so the key and the reading cannot drift
 * apart. Pure: no reads or writes here.
 */

/** Seven days, in milliseconds (D11). */
export const RECORDS_ALERT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/** The `user_preferences` key for this community's snooze. */
export function recordsAlertSnoozeKey(communityId: number): string {
  return `site_records_alert:${communityId}`;
}

/** The stored snooze when it is still in force at `now` (ms), else null. Reads only the key the route writes. */
export function readSnoozedUntil(stored: unknown, now: number): string | null {
  const value =
    typeof stored === 'object' && stored !== null
      ? (stored as Record<string, unknown>)['snoozedUntil']
      : undefined;
  if (typeof value !== 'string') return null;
  const until = new Date(value).getTime();
  return Number.isNaN(until) || until <= now ? null : value;
}
