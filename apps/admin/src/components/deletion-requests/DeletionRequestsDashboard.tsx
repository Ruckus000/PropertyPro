'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import {
  Loader2,
  Trash2,
  Clock,
  X,
  XCircle,
  RotateCcw,
  ShieldAlert,
  User,
  Building2,
  CheckCircle,
} from 'lucide-react';
import { AlertBanner, Badge, Button, Input, type BadgeVariant } from '@propertypro/ui';
import type { AdminDeletionRequest } from '@/lib/server/deletion-requests';

/* ---------- types ---------- */

type DeletionStatus = 'cooling' | 'soft_deleted' | 'purged' | 'cancelled' | 'recovered';

interface DeletionRequestsDashboardProps {
  initialRequests: AdminDeletionRequest[];
  initialStatusFilter?: string;
  initialTypeFilter?: string;
  /** Seeds the requester-email filter from `?q=` — the inbox privacy strip's
   * "does this person have a deletion request open?" link. */
  initialEmailFilter?: string;
}

/* ---------- status styling ---------- */

const STATUS_CONFIG: Record<DeletionStatus, { variant: BadgeVariant; icon: typeof Clock; label: string }> = {
  cooling: { variant: 'warning', icon: Clock, label: 'Cooling Off' },
  soft_deleted: { variant: 'danger', icon: Trash2, label: 'Soft Deleted' },
  purged: { variant: 'neutral', icon: XCircle, label: 'Purged' },
  cancelled: { variant: 'info', icon: CheckCircle, label: 'Cancelled' },
  recovered: { variant: 'success', icon: RotateCcw, label: 'Recovered' },
};

/* ---------- component ---------- */

export function DeletionRequestsDashboard({
  initialRequests,
  initialStatusFilter = 'all',
  initialTypeFilter = 'all',
  initialEmailFilter = '',
}: DeletionRequestsDashboardProps) {
  const [requests, setRequests] = useState<AdminDeletionRequest[]>(initialRequests);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [typeFilter, setTypeFilter] = useState<string>(initialTypeFilter);
  const [emailFilter, setEmailFilter] = useState(initialEmailFilter);
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

  const visibleRequests = useMemo(() => {
    const q = emailFilter.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) => r.requesterEmail?.toLowerCase().includes(q));
  }, [requests, emailFilter]);

  const coolingRequests = requests.filter((r) => r.status === 'cooling');

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-content-disabled" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-status-danger-border bg-status-danger-bg p-4 text-sm text-status-danger" role="alert">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {coolingRequests.length > 0 && (
        <AlertBanner
          status="warning"
          variant="subtle"
          title={`${coolingRequests.length} ${coolingRequests.length === 1 ? 'request is' : 'requests are'} in the cooling-off period`}
          description={coolingRequests
            .map((r) => {
              const target = r.requestType === 'community' ? r.communityName ?? `Community #${r.communityId}` : r.requesterEmail ?? 'User account';
              return `${target} (ends ${format(new Date(r.coolingEndsAt), 'MMM d, yyyy')})`;
            })
            .join(', ')}
        />
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="status-filter" className="text-xs font-medium text-content-tertiary uppercase tracking-wide">
            Status
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-edge-strong bg-surface-card px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
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
          <label htmlFor="type-filter" className="text-xs font-medium text-content-tertiary uppercase tracking-wide">
            Type
          </label>
          <select
            id="type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-edge-strong bg-surface-card px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
          >
            <option value="all">All</option>
            <option value="user">User</option>
            <option value="community">Community</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="email-filter" className="text-xs font-medium text-content-tertiary uppercase tracking-wide">
            Requester
          </label>
          <Input
            id="email-filter"
            type="search"
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
            placeholder="Filter by email…"
            className="h-8 w-56 py-1.5 text-sm"
          />
        </div>

        <span className="ml-auto text-xs text-content-disabled">
          {visibleRequests.length} {visibleRequests.length === 1 ? 'request' : 'requests'}
        </span>
      </div>

      {/* Table */}
      {visibleRequests.length === 0 ? (
        <div className="rounded-lg border border-edge bg-surface-card p-8 text-center">
          <ShieldAlert size={24} className="mx-auto mb-2 text-content-disabled" aria-hidden="true" />
          <p className="text-sm text-content-tertiary">No deletion requests found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-edge bg-surface-card shadow-e1">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-edge">
              <thead className="bg-surface-page">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Requester</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Target</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Requested</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Cooling Ends</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Purge Scheduled</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-content-tertiary">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge-subtle">
                {visibleRequests.map((req) => {
                  const config = STATUS_CONFIG[req.status];
                  const StatusIcon = config.icon;

                  return (
                    <tr key={req.id} className="hover:bg-surface-page">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-sm text-content-secondary">
                          {req.requestType === 'user' ? (
                            <User size={14} className="text-content-disabled" aria-hidden="true" />
                          ) : (
                            <Building2 size={14} className="text-content-disabled" aria-hidden="true" />
                          )}
                          {req.requestType === 'user' ? 'User' : 'Community'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={config.variant} size="sm">
                          <Badge.Icon>
                            <StatusIcon aria-hidden="true" />
                          </Badge.Icon>
                          <Badge.Label>{config.label}</Badge.Label>
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          {req.requesterName && (
                            <p className="text-sm font-medium text-content">{req.requesterName}</p>
                          )}
                          <p className="text-xs text-content-tertiary">{req.requesterEmail ?? req.userId}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-content-secondary">
                        {req.requestType === 'community'
                          ? req.communityName ?? `Community #${req.communityId}`
                          : req.requesterEmail ?? 'User account'}
                      </td>
                      <td className="px-4 py-3 text-xs text-content-tertiary">
                        {format(new Date(req.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 text-xs text-content-tertiary">
                        {format(new Date(req.coolingEndsAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 text-xs text-content-tertiary">
                        {req.scheduledPurgeAt
                          ? format(new Date(req.scheduledPurgeAt), 'MMM d, yyyy')
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {req.status === 'cooling' && (
                          <Button variant="outline" size="sm" onClick={() => setShowIntervene(req.id)}>
                            <ShieldAlert size={12} aria-hidden="true" />
                            Intervene
                          </Button>
                        )}
                        {req.status === 'soft_deleted' && (
                          <Button variant="outline" size="sm" onClick={() => setShowRecover(req.id)}>
                            <RotateCcw size={12} aria-hidden="true" />
                            Recover
                          </Button>
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
        <h3 className="text-lg font-semibold text-content">Intervene on Deletion Request</h3>
        <p className="text-sm text-content-tertiary">
          This will cancel the deletion request during the cooling-off period. The account will not be deleted.
        </p>

        <div>
          <label htmlFor="intervene-notes" className="block text-sm font-medium text-content-secondary mb-1">
            Notes
          </label>
          <textarea
            id="intervene-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reason for intervention..."
            className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
          />
        </div>

        {error && (
          <div className="rounded-md border border-status-danger-border bg-status-danger-bg p-3 text-sm text-status-danger" role="alert">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={saving}>
            Intervene
          </Button>
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
        <h3 className="text-lg font-semibold text-content">Recover Account</h3>
        <p className="text-sm text-content-tertiary">
          This will restore the soft-deleted account or community. All data that hasn&apos;t been purged will be recovered.
        </p>

        {error && (
          <div className="rounded-md border border-status-danger-border bg-status-danger-bg p-3 text-sm text-status-danger" role="alert">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" loading={saving} onClick={handleConfirm}>
            Recover Account
          </Button>
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
      <div className="relative w-full max-w-md rounded-lg bg-surface-card p-6 shadow-xl">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-3 top-3 h-auto w-auto p-1 text-content-disabled hover:text-content-secondary"
        >
          <X size={16} aria-hidden="true" />
        </Button>
        {children}
      </div>
    </div>
  );
}
