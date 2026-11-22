import type { StatusGlyphKind } from '@propertypro/ui/components/shared/status-glyph';

/**
 * One status for a broadcast, shared by the list and detail pages.
 * Same precedence as getStatusLabel in BroadcastHistoryTable: canceled, then sent, then draft.
 */
export function broadcastStatus(b: { canceledAt: string | null; completedAt: string | null }): {
  kind: StatusGlyphKind;
  word: string;
} {
  if (b.canceledAt) return { kind: 'not-started', word: 'Canceled' };
  if (b.completedAt) return { kind: 'done', word: 'Sent' };
  return { kind: 'in-progress', word: 'Draft' };
}
