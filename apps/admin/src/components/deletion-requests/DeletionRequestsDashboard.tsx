'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import {
  Loader2,
  Trash2,
  Clock,
  XCircle,
  RotateCcw,
  ShieldAlert,
  User,
  Building2,
  CheckCircle,
  X,
  AlertTriangle,
} from 'lucide-react';
import type { AdminDeletionRequest } from '@/lib/server/deletion-requests';

/* ---------- types ---------- */

type DeletionStatus = 'cooling' | 'soft_deleted' | 'purged' | 'cancelled' | 'recovered';

interface DeletionRequestsDashboardProps {
  initialRequests: AdminDeletionRequest[];
  initialStatusFilter?: string;
  initialTypeFilter?: string;
}

/* ---------- status styling ---------- */

const STATUS_STYLES: Record<DeletionStatus, { className: string; icon: typeof Clock; label: string }> = {
  cooling: { className: 'bg-yellow-100 text-yellow-700', icon: Clock, label: 'Cooling Off' },
  soft_deleted: { className: 'bg-red-100 text-red-700', icon: Trash2, label: 'Soft Deleted' },
  purged: { className: 'bg-gray-100 text-gray-600', icon: XCircle, label: 'Purged' },
  cancelled: { className: 'bg-blue-100 text-blue-700', icon: CheckCircle, label: 'Cancelled' },
  recovered: { className: 'bg-green-100 text-green-700', icon: RotateCcw, label: 'Recovered' },
};

/* ---------- component ---------- */

export function DeletionRequestsDashboard({
  initialRequests,
  initialStatusFilter = 'all',
  initialTypeFilter = 'all',
}: DeletionRequestsDashboardProps) {
  const [requests, setRequests] = useState<AdminDeletionRequest[]>(initialRequests);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [typeFilter, setTypeFilter] = useState<string>(initialTypeFilter);
  const hasHydrated = useRef(false);

  // Dialog states
  const [showIntervene, setShowIntervene] = useState<number | null>(null);
  const [showRecover, setShowRecover] = useState<number | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);

      const res = await fetch(`/api/admin/deletion-requests?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? 'Failed to load deletion requests');
        setRequests([]);
        return;
      }
      setError('');
      setRequests(data.requests);
    } catch {
      setError('Network error');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    if (!hasHydrated.current) {
      hasHydrated.current = true;
      return;
    }

    void fetchRequests();
  }, [fetchRequests]);

  const coolingCount = requests.filter((r) => r.status === 'cooling').length;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alert banner for cooling requests */}
      {coolingCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
          <AlertTriangle size={16} className="text-yellow-600 shrink-0" aria-hidden="true" />
          <p className="text-sm text-yellow-700">
            <span className="font-medium">{coolingCount}</span>{' '}
            {coolingCount === 1 ? 'request is' : 'requests are'} in the cooling-off period and can be intervened.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="status-filter" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Status
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All</option>
            <option value="cooling">Cooling Off</option>
            <option value="soft_deleted">Soft Deleted</option>
            <option value="purged">Purged</option>
            <option value="cancelled">Cancelled</option>
            <option value="recovered">Recovered</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="type-filter" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Type
          </label>
          <select
            id="type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All</option>
            <option value="user">User</option>
            <option value="community">Community</option>
          </select>
        </div>

        <span className="ml-auto text-xs text-gray-400">
          {requests.length} {requests.length === 1 ? 'request' : 'requests'}
        </span>
      </div>

      {/* Table */}
      {requests.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <ShieldAlert size={24} className="mx-auto mb-2 text-gray-300" aria-hidden="true" />
          <p className="text-sm text-gray-500">No deletion requests found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-e1">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Requester</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Target</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Requested</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Cooling Ends</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Purge Scheduled</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map((req) => {
                  const style = STATUS_STYLES[req.status];
                  const StatusIcon = style.icon;

                  return (
                    <tr key={req.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-sm text-gray-700">
                          {req.requestType === 'user' ? (
                            <User size={14} className="text-gray-400" aria-hidden="true" />
                          ) : (
                            <Building2 size={14} className="text-gray-400" aria-hidden="true" />
                          )}
                          {req.requestType === 'user' ? 'User' : 'Community'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.className}`}>
                          <StatusIcon size={12} aria-hidden="true" />
                          {style.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          {req.requesterName && (
                            <p className="text-sm font-medium text-gray-900">{req.requesterName}</p>
                          )}
                          <p className="text-xs text-gray-500">{req.requesterEmail ?? req.userId}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {req.requestType === 'community'
                          ? req.communityName ?? `Community #${req.communityId}`
                          : req.requesterEmail ?? 'User account'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {format(new Date(req.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {format(new Date(req.coolingEndsAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {req.scheduledPurgeAt
                          ? format(new Date(req.scheduledPurgeAt), 'MMM d, yyyy')
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {req.status === 'cooling' && (
                          <button
                            type="button"
                            onClick={() => setShowIntervene(req.id)}
                            className="inline-flex items-center gap-1 rounded border border-yellow-300 px-2 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-50 transition-colors"
                          >
                            <ShieldAlert size={12} aria-hidden="true" />
                            Intervene
                          </button>
                        )}
                        {req.status === 'soft_deleted' && (
                          <button
                            type="button"
                            onClick={() => setShowRecover(req.id)}
                            className="inline-flex items-center gap-1 rounded border border-green-300 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 transition-colors"
                          >
                            <RotateCcw size={12} aria-hidden="true" />
                            Recover
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dialogs */}
      {showIntervene !== null && (
        <InterveneDialog
          requestId={showIntervene}
          onClose={() => setShowIntervene(null)}
          onSuccess={fetchRequests}
        />
      )}
      {showRecover !== null && (
        <RecoverDialog
          requestId={showRecover}
          onClose={() => setShowRecover(null)}
          onSuccess={fetchRequests}
        />
      )}
    </div>
  );
}

/* ---------- Intervene Dialog ---------- */

function InterveneDialog({
  requestId,
  onClose,
  onSuccess,
}: {
  requestId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/admin/deletion-requests/${requestId}/intervene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes.trim() || null }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? 'Failed to intervene');
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogOverlay onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Intervene on Deletion Request</h3>
        <p className="text-sm text-gray-500">
          This will cancel the deletion request during the cooling-off period. The account will not be deleted.
        </p>

        <div>
          <label htmlFor="intervene-notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            id="intervene-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reason for intervention..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            Intervene
          </button>
        </div>
      </form>
    </DialogOverlay>
  );
}

/* ---------- Recover Dialog ---------- */

function RecoverDialog({
  requestId,
  onClose,
  onSuccess,
}: {
  requestId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/admin/deletion-requests/${requestId}/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? 'Failed to recover');
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogOverlay onClose={onClose}>
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Recover Account</h3>
        <p className="text-sm text-gray-500">
          This will restore the soft-deleted account or community. All data that hasn&apos;t been purged will be recovered.
        </p>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            Recover Account
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}

/* ---------- Dialog Overlay ---------- */

function DialogOverlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
          aria-label="Close dialog"
        >
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}
