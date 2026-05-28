import type { ChecklistItemData } from './compliance-checklist-item';
import { BOARD_ACTION_TEMPLATE_KEYS, needsAttention, SEVEN_DAYS_MS } from '@/lib/utils/compliance-calculator';
import type { ComplianceStatus } from '@/lib/utils/compliance-calculator';
import type { DefaultVisibility } from '@propertypro/shared';

export type StatusBadgeVariant = 'success' | 'warning' | 'danger' | 'neutral';
export type VisibilityBadgeVariant = 'owner' | 'board' | 'info';

export const VISIBILITY_LABEL: Record<DefaultVisibility, string> = {
  public_page: 'Public',
  owner_portal: 'Owner portal',
  owner_only: 'Owner-only',
  board: 'Board',
};

export const VISIBILITY_VARIANT: Record<DefaultVisibility, VisibilityBadgeVariant> = {
  public_page: 'info',
  owner_portal: 'owner',
  owner_only: 'owner',
  board: 'board',
};

export function statusLabel(item: ChecklistItemData): string {
  if (item.status === 'satisfied') return 'Satisfied';
  if (item.status === 'overdue') return 'Overdue';
  if (item.status === 'not_applicable') return 'Not applicable';
  if (BOARD_ACTION_TEMPLATE_KEYS.has(item.templateKey)) return 'Needs board action';
  return 'Action needed';
}

export function statusVariant(status: ComplianceStatus): StatusBadgeVariant {
  if (status === 'satisfied') return 'success';
  if (status === 'overdue') return 'danger';
  if (status === 'not_applicable') return 'neutral';
  return 'warning';
}

export type FilterKey = 'all' | 'action_needed' | 'overdue' | 'due_soon' | 'satisfied';

export function matchesFilter(item: ChecklistItemData, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'action_needed') return needsAttention(item);
  if (filter === 'overdue') return item.status === 'overdue';
  if (filter === 'satisfied') return item.status === 'satisfied';
  if (filter === 'due_soon') {
    return !!item.deadline && item.status === 'unsatisfied' &&
      (new Date(item.deadline).getTime() - Date.now()) <= SEVEN_DAYS_MS;
  }
  return true;
}
