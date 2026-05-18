'use client';

import { useState } from 'react';
import { assignRequest } from '@/lib/api/admin-maintenance';
import type { MaintenanceRequestItem } from '@/lib/api/maintenance-requests';
import { useResidents, ADMIN_ROLES_PARAM } from '@/hooks/use-residents';

interface AssignmentModalProps {
  request: MaintenanceRequestItem;
  communityId: number;
  onClose: () => void;
  onAssigned?: (updated: MaintenanceRequestItem) => void;
}

export function AssignmentModal({
  request,
  communityId,
  onClose,
  onAssigned,
}: AssignmentModalProps) {
  const {
    data: residentsData,
    isLoading: loading,
    isError: residentsError,
  } = useResidents(communityId, ADMIN_ROLES_PARAM);
  const residents = residentsData ?? [];
  const [selectedUserId, setSelectedUserId] = useState<string>(request.assignedToId ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayError =
    error ?? (residentsError ? 'Failed to load assignable users' : null);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await assignRequest(
        request.id,
        communityId,
        selectedUserId || null,
      );
      onAssigned?.(result.data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-md bg-surface-card p-6 shadow-e3">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-content">Assign Request</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-content-disabled hover:text-content-secondary"
          >
            &#x2715;
          </button>
        </div>

        <p className="mb-4 text-sm text-content-secondary truncate">{request.title}</p>

        {loading ? (
          <p className="text-sm text-content-tertiary">Loading staff members...</p>
        ) : (
          <form onSubmit={handleAssign} className="space-y-4">
            <div>
              <label htmlFor="assign-user" className="block text-sm font-medium text-content-secondary">
                Assign to
              </label>
              <select
                id="assign-user"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm shadow-e0 focus:border-edge-focus focus:outline-none focus:ring-1 ring-focus"
              >
                <option value="">Unassigned</option>
                {residents.map((r) => (
                  <option key={r.userId} value={r.userId}>
                    {r.fullName} ({r.role.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>

            {displayError && <p className="text-xs text-status-danger">{displayError}</p>}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-edge-strong px-3 py-1.5 text-sm text-content-secondary hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-interactive px-3 py-1.5 text-sm font-medium text-white hover:bg-interactive-hover disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Save Assignment'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
