const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Resolves an IANA timezone string, falling back to Eastern time if the value
 * is missing, empty, or invalid. Uses Intl.DateTimeFormat to validate — an
 * invalid timezone throws a RangeError which we catch here so callers never
 * need to handle it.
 */
export function resolveTimezone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}
