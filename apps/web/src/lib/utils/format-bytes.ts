/**
 * Binary-prefix byte formatting for UI copy.
 *
 * First lived in `services/export/export-notification.ts`, which still
 * re-exports it. Moved here when the site editor's storage meter needed it:
 * a panel importing from an export-notification service is the wrong
 * dependency direction, and a formatter has no business in a service anyway.
 * Behaviour is byte-identical to the original — its tests still run against
 * the re-export.
 */

/** Binary-prefix size, one decimal place. `0 B` for a missing/zero total. */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}
