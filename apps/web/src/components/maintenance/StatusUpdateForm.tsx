'use client';

import { useState } from 'react';
import { updateRequestStatus } from '@/lib/api/admin-maintenance';
import type { MaintenanceRequestItem } from '@/lib/api/maintenance-requests';

// Valid transitions from each status. Mirrors [id]/route.ts ALLOWED_TRANSITIONS.
// Client copy is intentional for UX (disable invalid options in the select).
// Server is the authoritative enforcer — keep in sync when transitions change.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  open:         ['submitted', 'acknowledged', 'in_progress'],
  submitted:    ['acknowledged', 'in_progress'],
  acknowledged: ['submitted', 'in_progress'],
  in_progress:  ['submitted', 'resolved'],
  resolved:     ['closed'],
  closed:       [],
};

interface StatusUpdateFormProps {
  request: MaintenanceRequestItem;
  communityId: number;
  onUpdated?: (updated: MaintenanceRequestItem) => void;
}

export function StatusUpdateForm({ request, communityId, onUpdated }: StatusUpdateFormProps) {
  const currentStatus = request.status === 'open' ? 'submitted' : request.status;
  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];

  const [newStatus, setNewStatus] = useState(allowed[0] ?? '');
  const [internalNotes, setInternalNotes] = useState(request.internalNotes ?? '');
  const [resolutionDescription, setResolutionDescription] = useState(
    request.resolutionDescription ?? '',
  );
  const [resolutionDate, setResolutionDate] = useState(
    request.resolutionDate ? request.resolutionDate.split('T')[0] : '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isResolvingStatus = newStatus === 'resolved';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newStatus) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await updateRequestStatus(request.id, communityId, {
        status: newStatus,
        internalNotes: internalNotes || null,
        resolutionDescription: isResolvingStatus ? resolutionDescription || null : undefined,
        resolutionDate: isResolvingStatus && resolutionDate ? `${resolutionDate}T00:00:00Z` : undefined,
      });
      onUpdated?.(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setSubmitting(false);
    }
  }

  if (allowed.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No further transitions available for <strong>{currentStatus}</strong>.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor={`status-${request.id}`} className="block text-sm font-medium text-gray-700">
          Change Status
        </label>
        <select
          id={`status-${request.id}`}
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {allowed.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`notes-${request.id}`} className="block text-sm font-medium text-gray-700">
          Internal Notes
        </label>
        <textarea
          id={`notes-${request.id}`}
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="Internal notes (not visible to residents)"
        />
      </div>

      {isResolvingStatus && (
        <>
          <div>
            <label htmlFor={`resolution-${request.id}`} className="block text-sm font-medium text-gray-700">
              Resolution Description
            </label>
            <textarea
              id={`resolution-${request.id}`}
              value={resolutionDescription}
              onChange={(e) => setResolutionDescription(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor={`resolution-date-${request.id}`} className="block text-sm font-medium text-gray-700">
              Resolution Date
            </label>
            <input
              id={`resolution-date-${request.id}`}
              type="date"
              value={resolutionDate}
              onChange={(e) => setResolutionDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !newStatus}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {submitting ? 'Updating…' : 'Update Status'}
      </button>
    </form>
  );
}
