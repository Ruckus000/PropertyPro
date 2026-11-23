import type { StatusGlyphKind } from '@propertypro/ui/components/shared/status-glyph';

/**
 * Pure helpers shared by the Emergency Alerts list and detail pages.
 */

/**
 * One status for a broadcast, shared by the list and detail pages.
 * Precedence: canceled, then sent, then draft.
 * The detail page words an unsent alert "Pending" (its banner says "pending
 * confirmation"); pass `unsentWord` there. The list keeps "Draft".
 */
export function broadcastStatus(
  b: { canceledAt: string | null; completedAt: string | null },
  opts: { unsentWord?: string } = {},
): {
  kind: StatusGlyphKind;
  word: string;
} {
  if (b.canceledAt) return { kind: 'not-started', word: 'Canceled' };
  if (b.completedAt) return { kind: 'done', word: 'Sent' };
  return { kind: 'in-progress', word: opts.unsentWord ?? 'Draft' };
}

export const capitalise = (s: string) => (s === '' ? s : s.charAt(0).toUpperCase() + s.slice(1));

/** "Mar 1, 2026, 9:30 PM" in the community time zone. */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}

/** "Mar 1, 2026" in the community time zone. */
export function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone }).format(new Date(iso));
}
