'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Loader2,
  ShieldCheck,
  Plus,
  Clock,
  XCircle,
  CalendarPlus,
  AlertTriangle,
  CheckCircle,
  X,
} from 'lucide-react';

/* ---------- types ---------- */

type PlanStatus = 'active' | 'in_grace' | 'expired' | 'revoked' | 'converted';

interface AccessPlan {
  id: number;
  communityId: number;
  expiresAt: string;
  graceEndsAt: string;
  durationMonths: number;
  gracePeriodDays: number;
  notes: string | null;
  grantedBy: string;
  grantedByEmail: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  convertedAt: string | null;
  createdAt: string;
  status: PlanStatus;
}

interface CommunityAccessProps {
  communityId: number;
}

/* ---------- status styling ---------- */

const STATUS_STYLES: Record<PlanStatus, { className: string; icon: typeof CheckCircle; label: string }> = {
  active: { className: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Active' },
  in_grace: { className: 'bg-yellow-100 text-yellow-700', icon: Clock, label: 'Grace Period' },
  expired: { className: 'bg-gray-100 text-gray-600', icon: XCircle, label: 'Expired' },
  revoked: { className: 'bg-red-100 text-red-700', icon: XCircle, label: 'Revoked' },
  converted: { className: 'bg-blue-100 text-blue-700', icon: CheckCircle, label: 'Converted' },
};

/* ---------- component ---------- */

export function CommunityAccess({ communityId }: CommunityAccessProps) {
  const [plans, setPlans] = useState<AccessPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dialog states
  const [showGrant, setShowGrant] = useState(false);
  const [showRevoke, setShowRevoke] = useState<number | null>(null);
  const [showExtend, setShowExtend] = useState<number | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/access-plans?communityId=${communityId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? 'Failed to load access plans');
        return;
      }
      setPlans(data.plans);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const activePlan = plans.find((p) => p.status === 'active' || p.status === 'in_grace');

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 size={20} className="animate-spin text-gray-400" />
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
      {/* Status card */}
      <AccessStatusCard plan={activePlan} onGrant={() => setShowGrant(true)} />

      {/* History */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-gray-700">
          <ShieldCheck size={16} aria-hidden="true" />
          <h2 className="text-sm font-semibold">Access Plan History</h2>
        </div>

        {plans.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <ShieldCheck size={24} className="mx-auto mb-2 text-gray-300" aria-hidden="true" />
            <p className="text-sm text-gray-500">No access plans have been granted yet.</p>
            <button
              type="button"
              onClick={() => setShowGrant(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Plus size={14} aria-hidden="true" />
              Grant Free Access
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-e1">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Expires</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Grace Ends</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Granted</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Notes</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {plans.map((plan) => {
                  const style = STATUS_STYLES[plan.status];
                  const StatusIcon = style.icon;
                  return (
                    <tr key={plan.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.className}`}>
                          <StatusIcon size={12} aria-hidden="true" />
                          {style.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {plan.durationMonths} {plan.durationMonths === 1 ? 'month' : 'months'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {format(new Date(plan.expiresAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {format(new Date(plan.graceEndsAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-xs text-gray-500">{format(new Date(plan.createdAt), 'MMM d, yyyy')}</p>
                          {plan.grantedByEmail && (
                            <p className="text-xs text-gray-400">{plan.grantedByEmail}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                        {plan.notes || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(plan.status === 'active' || plan.status === 'in_grace') && (
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => setShowExtend(plan.id)}
                              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                              title="Extend plan"
                            >
                              <CalendarPlus size={12} className="inline mr-1" aria-hidden="true" />
                              Extend
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowRevoke(plan.id)}
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 transition-colors"
                              title="Revoke plan"
                            >
                              <XCircle size={12} className="inline mr-1" aria-hidden="true" />
                              Revoke
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {showGrant && (
        <GrantAccessDialog
          communityId={communityId}
          onClose={() => setShowGrant(false)}
          onSuccess={fetchPlans}
        />
      )}
      {showRevoke !== null && (
        <RevokeAccessDialog
          planId={showRevoke}
          onClose={() => setShowRevoke(null)}
          onSuccess={fetchPlans}
        />
      )}
      {showExtend !== null && (
        <ExtendAccessDialog
          planId={showExtend}
          onClose={() => setShowExtend(null)}
          onSuccess={fetchPlans}
        />
      )}
    </div>
  );
}

/* ---------- Status Card ---------- */

function AccessStatusCard({
  plan,
  onGrant,
}: {
  plan?: AccessPlan;
  onGrant: () => void;
}) {
  if (!plan) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-e1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
              <ShieldCheck size={20} className="text-gray-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">No Active Access Plan</p>
              <p className="text-xs text-gray-500">This community does not have a free access plan.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onGrant}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus size={14} aria-hidden="true" />
            Grant Free Access
          </button>
        </div>
      </div>
    );
  }

  const style = STATUS_STYLES[plan.status];
  const StatusIcon = style.icon;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-e1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${plan.status === 'active' ? 'bg-green-100' : 'bg-yellow-100'}`}>
            <StatusIcon size={20} className={plan.status === 'active' ? 'text-green-600' : 'text-yellow-600'} aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-900">
                {plan.status === 'active' ? 'Active Free Access' : 'Grace Period'}
              </p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>
                {style.label}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Expires {format(new Date(plan.expiresAt), 'MMM d, yyyy')}
              {plan.status === 'in_grace' && (
                <> · Grace ends {format(new Date(plan.graceEndsAt), 'MMM d, yyyy')}</>
              )}
            </p>
          </div>
        </div>
        {plan.status === 'in_grace' && (
          <div className="flex items-center gap-1.5 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-1.5">
            <AlertTriangle size={14} className="text-yellow-600" aria-hidden="true" />
            <span className="text-xs font-medium text-yellow-700">Grace period active</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Grant Dialog ---------- */

function GrantAccessDialog({
  communityId,
  onClose,
  onSuccess,
}: {
  communityId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [duration, setDuration] = useState('3');
  const [graceDays, setGraceDays] = useState('30');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/admin/access-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          durationMonths: Number(duration),
          gracePeriodDays: Number(graceDays),
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? 'Failed to grant access');
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
        <h3 className="text-lg font-semibold text-gray-900">Grant Free Access</h3>

        <div>
          <label htmlFor="grant-duration" className="block text-sm font-medium text-gray-700 mb-1">
            Duration (months) <span className="text-red-500">*</span>
          </label>
          <input
            id="grant-duration"
            type="number"
            min="1"
            max="24"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="grant-grace" className="block text-sm font-medium text-gray-700 mb-1">
            Grace period (days)
          </label>
          <input
            id="grant-grace"
            type="number"
            min="0"
            max="90"
            value={graceDays}
            onChange={(e) => setGraceDays(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="grant-notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            id="grant-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes about this access grant..."
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
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            Grant Access
          </button>
        </div>
      </form>
    </DialogOverlay>
  );
}

/* ---------- Revoke Dialog ---------- */

function RevokeAccessDialog({
  planId,
  onClose,
  onSuccess,
}: {
  planId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/admin/access-plans/${planId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? 'Failed to revoke access');
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
        <h3 className="text-lg font-semibold text-gray-900">Revoke Access Plan</h3>
        <p className="text-sm text-gray-500">
          This will immediately end the community&apos;s free access. This cannot be undone.
        </p>

        <div>
          <label htmlFor="revoke-reason" className="block text-sm font-medium text-gray-700 mb-1">
            Reason
          </label>
          <textarea
            id="revoke-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional reason for revoking access..."
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
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            Revoke Access
          </button>
        </div>
      </form>
    </DialogOverlay>
  );
}

/* ---------- Extend Dialog ---------- */

function ExtendAccessDialog({
  planId,
  onClose,
  onSuccess,
}: {
  planId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [months, setMonths] = useState('1');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/admin/access-plans/${planId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          additionalMonths: Number(months),
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? 'Failed to extend access');
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
        <h3 className="text-lg font-semibold text-gray-900">Extend Access Plan</h3>

        <div>
          <label htmlFor="extend-months" className="block text-sm font-medium text-gray-700 mb-1">
            Additional months <span className="text-red-500">*</span>
          </label>
          <input
            id="extend-months"
            type="number"
            min="1"
            max="24"
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="extend-notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            id="extend-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes about this extension..."
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
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            Extend Access
          </button>
        </div>
      </form>
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
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Dialog */}
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
