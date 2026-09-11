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
} from 'lucide-react';
import {
  AlertBanner,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
  type BadgeVariant,
} from '@propertypro/ui';

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

const STATUS_STYLES: Record<PlanStatus, { variant: BadgeVariant; icon: typeof CheckCircle; label: string }> = {
  active: { variant: 'success', icon: CheckCircle, label: 'Active' },
  in_grace: { variant: 'warning', icon: Clock, label: 'Grace Period' },
  expired: { variant: 'neutral', icon: XCircle, label: 'Expired' },
  revoked: { variant: 'danger', icon: XCircle, label: 'Revoked' },
  converted: { variant: 'info', icon: CheckCircle, label: 'Converted' },
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
        <Loader2 size={20} className="animate-spin text-content-disabled" aria-hidden="true" />
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
      {/* Status card */}
      <AccessStatusCard plan={activePlan} onGrant={() => setShowGrant(true)} />

      {/* History */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-content-secondary">
          <ShieldCheck size={16} aria-hidden="true" />
          <h2 className="text-sm font-semibold">Access Plan History</h2>
        </div>

        {plans.length === 0 ? (
          <div className="rounded-lg border border-edge bg-surface-card p-8 text-center">
            <ShieldCheck size={24} className="mx-auto mb-2 text-content-disabled" aria-hidden="true" />
            <p className="text-sm text-content-tertiary">No access plans have been granted yet.</p>
            <Button type="button" size="sm" className="mt-3" onClick={() => setShowGrant(true)}>
              <Plus size={14} aria-hidden="true" />
              Grant Free Access
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-edge bg-surface-card shadow-e1">
            <table className="min-w-full divide-y divide-edge">
              <thead className="bg-surface-page">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Expires</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Grace Ends</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Granted</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Notes</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-content-tertiary">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge-subtle">
                {plans.map((plan) => {
                  const style = STATUS_STYLES[plan.status];
                  const StatusIcon = style.icon;
                  return (
                    <tr key={plan.id} className="hover:bg-surface-page">
                      <td className="px-4 py-3">
                        <Badge variant={style.variant} size="sm">
                          <Badge.Icon><StatusIcon /></Badge.Icon>
                          <Badge.Label>{style.label}</Badge.Label>
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-content">
                        {plan.durationMonths} {plan.durationMonths === 1 ? 'month' : 'months'}
                      </td>
                      <td className="px-4 py-3 text-xs text-content-tertiary">
                        {format(new Date(plan.expiresAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 text-xs text-content-tertiary">
                        {format(new Date(plan.graceEndsAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-xs text-content-tertiary">{format(new Date(plan.createdAt), 'MMM d, yyyy')}</p>
                          {plan.grantedByEmail && (
                            <p className="text-xs text-content-disabled">{plan.grantedByEmail}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-content-tertiary max-w-[200px] truncate">
                        {plan.notes || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(plan.status === 'active' || plan.status === 'in_grace') && (
                          <div className="inline-flex gap-1">
                            <Button type="button" variant="outline" size="sm" onClick={() => setShowExtend(plan.id)}>
                              <CalendarPlus size={12} aria-hidden="true" />
                              Extend
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-status-danger-border text-status-danger hover:bg-status-danger-bg"
                              onClick={() => setShowRevoke(plan.id)}
                            >
                              <XCircle size={12} aria-hidden="true" />
                              Revoke
                            </Button>
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

      {/* Dialogs — conditionally MOUNTED (not just visually hidden), so each
          open starts from fresh form state rather than whatever was typed
          the last time it was open. */}
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
      <div className="rounded-lg border border-edge bg-surface-card p-5 shadow-e1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted">
              <ShieldCheck size={20} className="text-content-disabled" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-content">No Active Access Plan</p>
              <p className="text-xs text-content-tertiary">This community does not have a free access plan.</p>
            </div>
          </div>
          <Button type="button" size="sm" onClick={onGrant}>
            <Plus size={14} aria-hidden="true" />
            Grant Free Access
          </Button>
        </div>
      </div>
    );
  }

  const style = STATUS_STYLES[plan.status];
  const StatusIcon = style.icon;

  return (
    <div className="rounded-lg border border-edge bg-surface-card p-5 shadow-e1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${plan.status === 'active' ? 'bg-status-success-subtle' : 'bg-status-warning-subtle'}`}>
            <StatusIcon size={20} className={plan.status === 'active' ? 'text-status-success' : 'text-status-warning'} aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-content">
                {plan.status === 'active' ? 'Active Free Access' : 'Grace Period'}
              </p>
              <Badge variant={style.variant} size="sm">{style.label}</Badge>
            </div>
            <p className="text-xs text-content-tertiary">
              Expires {format(new Date(plan.expiresAt), 'MMM d, yyyy')}
              {plan.status === 'in_grace' && (
                <> · Grace ends {format(new Date(plan.graceEndsAt), 'MMM d, yyyy')}</>
              )}
            </p>
          </div>
        </div>
        {plan.status === 'in_grace' && (
          <div className="flex items-center gap-1.5 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-1.5">
            <AlertTriangle size={14} className="text-status-warning" aria-hidden="true" />
            <span className="text-xs font-medium text-status-warning">Grace period active</span>
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
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Grant Free Access</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="grant-duration">
              Duration (months) <span className="text-status-danger">*</span>
            </Label>
            <Input
              id="grant-duration"
              type="number"
              min="1"
              max="24"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="grant-grace">Grace period (days)</Label>
            <Input
              id="grant-grace"
              type="number"
              min="0"
              max="90"
              value={graceDays}
              onChange={(e) => setGraceDays(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="grant-notes">Notes</Label>
            <Textarea
              id="grant-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this access grant..."
            />
          </div>

          {error && (
            <AlertBanner status="danger" title={error} />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Grant Access
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Revoke Access Plan</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-content-tertiary">
            This will immediately end the community&apos;s free access. This cannot be undone.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="revoke-reason">Reason</Label>
            <Textarea
              id="revoke-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional reason for revoking access..."
            />
          </div>

          {error && (
            <AlertBanner status="danger" title={error} />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" loading={saving}>
              Revoke Access
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Extend Access Plan</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="extend-months">
              Additional months <span className="text-status-danger">*</span>
            </Label>
            <Input
              id="extend-months"
              type="number"
              min="1"
              max="24"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="extend-notes">Notes</Label>
            <Textarea
              id="extend-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this extension..."
            />
          </div>

          {error && (
            <AlertBanner status="danger" title={error} />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Extend Access
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
