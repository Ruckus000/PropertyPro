'use client';

/**
 * P3-53: Audit trail filter controls.
 *
 * Supports filtering by action type, date range, and user.
 */

import { UserSearchCombobox } from '@/components/shared/UserSearchCombobox';

export interface AuditFilterValues {
  action?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}

interface AuditFiltersProps {
  communityId: number;
  filters: AuditFilterValues;
  onFilterChange: (filters: AuditFilterValues) => void;
}

const AUDIT_ACTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'user_invited', label: 'User Invited' },
  { value: 'settings_changed', label: 'Settings Changed' },
  { value: 'meeting_notice_posted', label: 'Meeting Notice' },
  { value: 'document_deleted', label: 'Document Deleted' },
  { value: 'document_accessed', label: 'Document Accessed' },
  { value: 'announcement_email_sent', label: 'Announcement Sent' },
  // Out-of-band production data repairs (see the AuditAction docblock in
  // packages/db/src/utils/audit-logger.ts). Worth filtering for: these are the
  // entries that explain a change no app mutation accounts for.
  //
  // NOTE this list is hand-maintained and already lags AuditAction badly — the
  // union carries ~30 members and this has 11, so role_assigned, root_transferred
  // and the rest are unfilterable. Display is unaffected (formatAction in
  // AuditEntry.tsx derives a label from any string); only the dropdown is short.
  { value: 'data_repair', label: 'Data Repair' },
];

export function AuditFilters({
  communityId,
  filters,
  onFilterChange,
}: AuditFiltersProps) {
  function handleChange(key: keyof AuditFilterValues, value: string) {
    onFilterChange({ ...filters, [key]: value || undefined });
  }

  return (
    <div className="flex flex-wrap gap-3">
      <div>
        <label htmlFor="filter-action" className="block text-xs font-medium text-content-tertiary">
          Action
        </label>
        <select
          id="filter-action"
          value={filters.action ?? ''}
          onChange={(e) => handleChange('action', e.target.value)}
          className="mt-1 block rounded-md border-edge-strong text-sm shadow-e0 focus:border-edge-focus focus:ring-focus"
        >
          {AUDIT_ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filter-start" className="block text-xs font-medium text-content-tertiary">
          Start Date
        </label>
        <input
          id="filter-start"
          type="date"
          value={filters.startDate ?? ''}
          onChange={(e) => handleChange('startDate', e.target.value)}
          className="mt-1 block rounded-md border-edge-strong text-sm shadow-e0 focus:border-edge-focus focus:ring-focus"
        />
      </div>

      <div>
        <label htmlFor="filter-end" className="block text-xs font-medium text-content-tertiary">
          End Date
        </label>
        <input
          id="filter-end"
          type="date"
          value={filters.endDate ?? ''}
          onChange={(e) => handleChange('endDate', e.target.value)}
          className="mt-1 block rounded-md border-edge-strong text-sm shadow-e0 focus:border-edge-focus focus:ring-focus"
        />
      </div>

      <div className="w-full min-w-0 flex-1 basis-full sm:basis-64">
        <span className="block text-xs font-medium text-content-tertiary">User</span>
        <div className="mt-1">
          <UserSearchCombobox
            communityId={communityId}
            value={filters.userId ?? null}
            onChange={(userId) =>
              onFilterChange({ ...filters, userId: userId ?? undefined })
            }
            placeholder="Search by name or unit..."
          />
        </div>
      </div>
    </div>
  );
}
