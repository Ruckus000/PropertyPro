/**
 * How an ARC status is labelled and coloured.
 *
 * Extracted from `ArcSubmissionsTab` when the resident view (#933) became the
 * second reader — two real uses with identical meaning, which is where the
 * duplication is worth removing. A reviewer and a resident looking at the same
 * submission must not see it described differently.
 */
import type { ArcSubmissionStatus } from '@/hooks/use-arc';

export const STATUS_BADGE_CLASSES: Record<ArcSubmissionStatus, string> = {
  submitted: 'bg-status-warning-bg text-status-warning border-status-warning-border',
  under_review: 'bg-interactive-muted text-content-link border-status-info-border',
  approved: 'bg-status-success-bg text-status-success border-status-success-border',
  denied: 'bg-status-danger-bg text-status-danger border-status-danger-border',
  withdrawn: 'bg-surface-muted text-content-secondary border-edge',
};

export const STATUS_LABELS: Record<ArcSubmissionStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  denied: 'Denied',
  withdrawn: 'Withdrawn',
};
