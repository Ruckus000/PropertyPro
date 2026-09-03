/**
 * Binary-prefix byte formatting for UI copy.
 *
 * Extracted from `services/export/export-notification.ts` so that client
 * components can use it: that module imports `@propertypro/db/unsafe` and
 * `@propertypro/email`, and a `'use client'` component must not pull either
 * into the browser bundle. `export-job-card.tsx` was carrying its own private
 * copy of this function for exactly that reason.
 *
 * The arithmetic is unchanged from the original; the input guard and the lower
 * clamp on the unit index are new, because a helper living in `lib/utils` is
 * reachable from callers whose byte counts are not guaranteed to be positive
 * integers.
 */

/**
 * Binary-prefix size, one decimal place above bytes (whole bytes render bare,
 * e.g. `512 B`). `0 B` for anything missing, non-finite or not positive.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  // Clamp BOTH ends: bytes < 1 gives a negative exponent, and `units[-1]` is
  // `undefined`, which renders into the page as the literal text "undefined".
  const exponent = Math.max(
    0,
    Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1),
  );
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}
