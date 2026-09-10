/**
 * The clock the admin console speaks in.
 *
 * The dashboard's greeting and date render on the SERVER, and on Vercel the
 * server's local zone is UTC. `new Date().getHours()` and a bare
 * `Intl.DateTimeFormat` therefore told a Florida operator at 21:00 EDT "Good
 * morning · Friday, September 11" on the evening of Thursday the 10th — wrong
 * greeting and wrong date, every evening, in the page's most prominent line.
 *
 * There is no canonical platform-timezone constant in the repo to reuse:
 * `communities.timezone` is PER COMMUNITY (defaulting to `America/New_York`,
 * `packages/db/src/schema/communities.ts`), and `formatBillingDateUTC` is
 * deliberately UTC because it pins a billing boundary. Neither fits a
 * platform-operator greeting, so the zone is named here, once, with its reason.
 *
 * Eastern, not the viewer's own zone: PropertyPro is a Florida-statute product
 * and this console has one operator team, in Florida. Deriving it per viewer
 * would mean moving both values client-side and accepting a hydration flash on
 * the first line of the page.
 */

/** Florida. Everything on this screen is an Eastern-time business day. */
export const PLATFORM_TIME_ZONE = 'America/New_York';

const platformHourFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  // h23 rather than `hour12: false`, which yields "24" for midnight on some ICU
  // builds — a value no comparison below would read correctly.
  hourCycle: 'h23',
  timeZone: PLATFORM_TIME_ZONE,
});

const platformDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  timeZone: PLATFORM_TIME_ZONE,
});

/** The hour (0-23) `instant` falls in, in `PLATFORM_TIME_ZONE`. */
export function platformHour(instant: Date): number {
  const hour = platformHourFormatter
    .formatToParts(instant)
    .find((part) => part.type === 'hour')?.value;
  const parsed = Number(hour);

  // Unreachable with a full-ICU runtime (Node 20 ships one, and so does
  // Vercel's). Thrown rather than defaulted, because every default is a
  // specific wrong greeting shown as fact — the exact failure this file exists
  // to fix.
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
    throw new Error(`Could not read the hour in ${PLATFORM_TIME_ZONE}: got ${String(hour)}`);
  }

  return parsed;
}

/** "Good morning" / "Good afternoon" / "Good evening", on the platform clock. */
export function greetingFor(instant: Date): string {
  const hour = platformHour(instant);
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** "Thursday, September 10" — the platform-clock calendar day of `instant`. */
export function formatPlatformDate(instant: Date): string {
  return platformDateFormatter.format(instant);
}
