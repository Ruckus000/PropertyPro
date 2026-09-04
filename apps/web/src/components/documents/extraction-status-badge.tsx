/**
 * Whether a document's text was extracted, and so whether search can reach
 * inside it.
 *
 * Lifted out of `document-list.tsx` when the merged records table replaced it.
 * The badge outlived that list — it has its own test file — so it moved rather
 * than being deleted with its former host.
 */
import type { DocumentExtractionStatus } from '@/lib/documents/document-state';

const EXTRACTION_BADGE_CONFIG: Record<string, { label: string; className: string } | null> = {
  completed: {
    label: 'Searchable',
    className: 'bg-status-success-bg text-status-success',
  },
  pending: {
    label: 'Processing',
    className: 'bg-status-warning-bg text-status-warning',
  },
  failed: {
    label: 'Search unavailable',
    className: 'bg-status-danger-bg text-status-danger',
  },
  skipped: {
    label: 'Not searchable',
    className: 'bg-surface-muted text-content-secondary',
  },
  not_applicable: null,
};

export function ExtractionStatusBadge({
  status,
}: {
  status?: DocumentExtractionStatus | null;
}) {
  // Backward compatible: null/undefined extractionStatus treated as not_applicable
  if (status == null || status === 'not_applicable') return null;

  const config = EXTRACTION_BADGE_CONFIG[status];
  if (!config) return null;

  return (
    <span
      data-testid="extraction-badge"
      data-extraction-status={status}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
