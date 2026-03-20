'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listAllRequests,
  type MaintenanceRequestItem,
  type ListAllRequestsParams,
} from '@/lib/api/admin-maintenance';
import { getRequest } from '@/lib/api/maintenance-requests';
import { StatusUpdateForm } from './StatusUpdateForm';
import { AssignmentModal } from './AssignmentModal';
import { CommentThread } from './CommentThread';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { formatShortDate } from '@/lib/utils/format-date';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'general', label: 'General' },
  { value: 'other', label: 'Other' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-status-warning-bg text-status-warning',
  acknowledged: 'bg-interactive-subtle text-content-link',
  in_progress: 'bg-status-info-bg text-status-info',
  resolved: 'bg-status-success-bg text-status-success',
  closed: 'bg-surface-muted text-content-secondary',
  open: 'bg-status-warning-bg text-status-warning',
};

interface AdminInboxProps {
  communityId: number;
  userId: string;
  userRole: string;
}

export function AdminInbox({ communityId }: AdminInboxProps) {
  const [requests, setRequests] = useState<MaintenanceRequestItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');

  const [detailRequest, setDetailRequest] = useState<MaintenanceRequestItem | null>(null);
  const [assignModalRequest, setAssignModalRequest] = useState<MaintenanceRequestItem | null>(null);

  const limit = 20;

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: ListAllRequestsParams = { page, limit };
      if (selectedStatus) params.status = selectedStatus;
      if (selectedCategory) params.category = selectedCategory;
      if (selectedPriority) params.priority = selectedPriority;
      const res = await listAllRequests(communityId, params);
      setRequests(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [communityId, page, selectedStatus, selectedCategory, selectedPriority]);

  useEffect(() => { void fetchRequests(); }, [fetchRequests]);

  function handleUpdated(updated: MaintenanceRequestItem) {
    setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    if (detailRequest?.id === updated.id) {
      setDetailRequest(updated);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={selectedStatus}
          onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
          className="rounded-md border border-edge-strong px-3 py-1.5 text-sm shadow-e0"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={selectedCategory}
          onChange={(e) => { setSelectedCategory(e.target.value); setPage(1); }}
          className="rounded-md border border-edge-strong px-3 py-1.5 text-sm shadow-e0"
        >
          {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={selectedPriority}
          onChange={(e) => { setSelectedPriority(e.target.value); setPage(1); }}
          className="rounded-md border border-edge-strong px-3 py-1.5 text-sm shadow-e0"
        >
          {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading maintenance requests">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-md bg-surface-muted" />
          ))}
        </div>
      )}
      {error && (
        <AlertBanner
          status="danger"
          title={error}
          action={
            <button
              type="button"
              onClick={() => void fetchRequests()}
              className="shrink-0 rounded-md border border-status-danger-border bg-status-danger-bg px-3 py-1.5 text-xs font-medium text-status-danger hover:opacity-90"
            >
              Retry
            </button>
          }
        />
      )}

      {!loading && !error && requests.length === 0 && (
        <EmptyState preset="no_maintenance_requests" />
      )}

      {/* Request list */}
      <div className="space-y-2">
        {requests.map((r) => {
          const statusLabel = r.status === 'open' ? 'submitted' : r.status;
          return (
            <div
              key={r.id}
              className="cursor-pointer rounded-md border border-edge bg-surface-card p-4 hover:bg-surface-hover"
              onClick={() => setDetailRequest((d) => d?.id === r.id ? null : r)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-content">{r.title}</p>
                  <p className="text-xs text-content-tertiary mt-0.5">
                    {r.category} &middot; {formatShortDate(r.createdAt)}
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[statusLabel] ?? 'bg-surface-muted text-content-secondary'}`}
                >
                  {statusLabel}
                </span>
              </div>

              {detailRequest?.id === r.id && (
                <div
                  className="mt-4 space-y-4 border-t border-edge-subtle pt-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-sm text-content-secondary">{r.description}</p>

                  {r.internalNotes && (
                    <div className="rounded-md bg-status-warning-bg p-3">
                      <p className="text-xs font-medium text-status-warning">Internal Notes</p>
                      <p className="mt-0.5 text-sm text-status-warning">{r.internalNotes}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAssignModalRequest(r)}
                      className="rounded-md border border-edge-strong px-3 py-1.5 text-xs text-content-secondary hover:bg-surface-hover"
                    >
                      {r.assignedToId ? 'Reassign' : 'Assign'}
                    </button>
                  </div>

                  <StatusUpdateForm
                    request={r}
                    communityId={communityId}
                    onUpdated={handleUpdated}
                  />

                  <CommentThread
                    communityId={communityId}
                    requestId={r.id}
                    comments={r.comments}
                    onCommentAdded={async () => {
                      try {
                        const res = await getRequest(r.id, communityId);
                        handleUpdated(res.data);
                      } catch {
                        // Silent failure — existing state preserved
                      }
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-edge-strong px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="flex items-center text-sm text-content-secondary">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-edge-strong px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {/* Assignment modal */}
      {assignModalRequest && (
        <AssignmentModal
          request={assignModalRequest}
          communityId={communityId}
          onClose={() => setAssignModalRequest(null)}
          onAssigned={(updated) => {
            handleUpdated(updated);
            setAssignModalRequest(null);
          }}
        />
      )}
    </div>
  );
}
