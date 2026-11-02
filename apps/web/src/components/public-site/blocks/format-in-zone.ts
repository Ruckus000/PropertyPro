/**
 * A date or time on the public site, in the community's own time zone.
 *
 * The one place the views format dates, so the fallback rule cannot drift: an
 * empty or invalid zone (legacy data in `communities.timezone`) falls back to
 * Eastern rather than breaking the section.
 *
 * Formatters are cached by zone and options. Building an `Intl.DateTimeFormat`
 * is far costlier than calling one, and the editor canvas re-renders these
 * views on every keystroke with up to 100 preview rows. Pure and client-safe.
 */
const FALLBACK_ZONE = 'America/New_York';
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${timeZone}|${JSON.stringify(opts)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { ...opts, timeZone });
    formatters.set(key, formatter);
  }
  return formatter;
}

export function formatInZone(value: Date, timezone: string, opts: Intl.DateTimeFormatOptions): string {
  try {
    return formatterFor(timezone || FALLBACK_ZONE, opts).format(value);
  } catch {
    // An unknown zone throws when the formatter is built; it is not cached.
    return formatterFor(FALLBACK_ZONE, opts).format(value);
  }
}
