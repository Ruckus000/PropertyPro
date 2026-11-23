/**
 * Tab access and review figures for the redesigned Violations page.
 *
 * Pure. Imports only types from db and the shared package, so the module
 * loads without DATABASE_URL.
 */
import type { ViolationStatus } from '@propertypro/db';
import { hasBoardDesignation, type CommunityRole } from '@propertypro/shared';
import type { ViolationItem } from '@/lib/api/violations';
import { OPEN_STATUSES } from './vocabulary';

export type ViolationsTab = 'review' | 'mine';

const ALL_STATUSES: readonly ViolationStatus[] = [
  'reported',
  'noticed',
  'hearing_scheduled',
  'fined',
  'resolved',
  'dismissed',
];

/**
 * Review is for anyone passing the board rule (`isAdmin || board designation`);
 * Mine is for any resident, board members included. Empty means no access.
 */
export function violationsTabs(m: {
  isAdmin: boolean;
  role: CommunityRole;
  designation: string | null;
}): ViolationsTab[] {
  const tabs: ViolationsTab[] = [];
  if (m.isAdmin || hasBoardDesignation(m.designation)) tabs.push('review');
  if (m.role === 'resident') tabs.push('mine');
  return tabs;
}

/**
 * The requested tab if allowed, else the first allowed one. An empty `allowed`
 * is a caller error (no access); it yields the least-privileged tab, 'mine'.
 */
export function pickTab(raw: string | undefined, allowed: ViolationsTab[]): ViolationsTab {
  const match = allowed.find((t) => t === raw);
  return match ?? allowed[0] ?? 'mine';
}

export function reviewFigures(
  rows: Pick<ViolationItem, 'status'>[],
  finesEnabled: boolean,
): {
  counts: Record<ViolationStatus | 'all', number>;
  open: number;
  waitingForNotice: number;
  hearings: number;
  filters: ViolationStatus[];
} {
  const counts = { all: rows.length } as Record<ViolationStatus | 'all', number>;
  for (const s of ALL_STATUSES) counts[s] = 0;
  for (const r of rows) counts[r.status] += 1;

  const open = OPEN_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  return {
    counts,
    open,
    waitingForNotice: counts.reported,
    hearings: counts.hearing_scheduled,
    filters: ALL_STATUSES.filter((s) => finesEnabled || s !== 'fined'),
  };
}
