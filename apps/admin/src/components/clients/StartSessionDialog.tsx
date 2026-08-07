'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { getSupportCookieRootDomain, isLocalSupportHostname } from '@propertypro/shared';

interface Member {
  userId: string;
  email: string;
  role: string;
}

interface StartSessionDialogProps {
  communityId: number;
  communitySlug: string;
  members: Member[];
  open: boolean;
  onClose: () => void;
}

export function StartSessionDialog({
  communityId,
  communitySlug,
  members,
  open,
  onClose,
}: StartSessionDialogProps) {
  const [targetUserId, setTargetUserId] = useState('');
  const [reason, setReason] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  /**
   * Whether the dialog is still open, readable from an in-flight handler.
   *
   * Closing cannot cancel the POST — by the time it resolves the route may
   * already have created the session and set the impersonation cookie. What it
   * must not do is act on that response: opening a tenant tab from a dialog the
   * operator dismissed is an impersonation window appearing out of nowhere.
   */
  const openRef = useRef(open);
  openRef.current = open;

  // Had `role="dialog"` and `aria-modal` but neither Escape nor focus
  // management — the ARIA promised modal behaviour the dialog did not
  // implement. This starts an impersonation session, so a keyboard user
  // needing to back out should not have to hunt for the Cancel button.
  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    function onKeyDown(event: KeyboardEvent) {
      // Not while the POST is in flight: the session may already exist
      // server-side, and closing would hide the error if it failed.
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const previous = restoreFocusRef.current;
      if (previous && previous.isConnected) previous.focus();
    };
  }, [open, submitting, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (reason.trim().length < 10) {
      setError('Reason must be at least 10 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/support/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId,
          communityId,
          reason: reason.trim(),
          ticketId: ticketId.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to start session');
        return;
      }

      // The session token is NOT in `data` — the route sets it as an HttpOnly
      // cookie on this response, scoped to the shared root domain. Do not
      // reintroduce a client-side cookie write: `document.cookie` cannot set
      // HttpOnly, which is what made the old token XSS-readable on every
      // tenant subdomain.
      const hostname = window.location.hostname;
      const rootDomain = getSupportCookieRootDomain(hostname);
      const isLocalHost = isLocalSupportHostname(hostname);

      const tenantUrl = isLocalHost || !rootDomain
        ? `http://${hostname}:3000/dashboard?communityId=${communityId}`
        : `https://${communitySlug}.${rootDomain}/dashboard`;

      // The dialog was dismissed while this was in flight. The session exists
      // — that is what the support access log is for — but do not surprise the
      // operator with a tab they did not ask for.
      if (!openRef.current) return;

      window.open(tenantUrl, '_blank');
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-session-title"
    >
      <div className="w-full max-w-md rounded-lg bg-surface-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge px-6 py-4">
          <h2 id="start-session-title" className="text-base font-semibold text-content">
            Start Support Session
          </h2>
          <button
            type="button"
            onClick={onClose}
            // Same rule as Cancel below. Without it this button bypassed the
            // Escape handler's `!submitting` guard entirely — one click
            // mid-POST and the session is still created server-side.
            disabled={submitting}
            className="rounded p-1 text-content-disabled hover:text-content-secondary disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral-600"
            aria-label="Close dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Warning banner */}
        <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg bg-status-warning-bg p-3 text-sm text-status-warning">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            <strong>Read-only mode.</strong> All actions are logged and visible to the community
            administrators.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
          {/* User select */}
          <div>
            <label
              htmlFor="target-user"
              className="mb-1 block text-sm font-medium text-content-secondary"
            >
              Impersonate user <span aria-hidden="true">*</span>
            </label>
            <select
              id="target-user"
              required
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="w-full rounded-md border border-edge-strong bg-surface-card px-3 py-2 text-sm focus:border-coral-500 focus:outline-none focus:ring-1 focus:ring-coral-500"
            >
              <option value="">Select a member…</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.email} ({m.role})
                </option>
              ))}
            </select>
          </div>

          {/* Reason */}
          <div>
            <label
              htmlFor="session-reason"
              className="mb-1 block text-sm font-medium text-content-secondary"
            >
              Reason <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="session-reason"
              required
              minLength={10}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe why support access is needed…"
              className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-coral-500 focus:outline-none focus:ring-1 focus:ring-coral-500"
            />
          </div>

          {/* Ticket ID */}
          <div>
            <label
              htmlFor="ticket-id"
              className="mb-1 block text-sm font-medium text-content-secondary"
            >
              Ticket ID <span className="text-content-disabled">(optional)</span>
            </label>
            <input
              id="ticket-id"
              type="text"
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              placeholder="e.g. SUPPORT-1234"
              className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-coral-500 focus:outline-none focus:ring-1 focus:ring-coral-500"
            />
          </div>

          {error && (
            <div className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger" role="alert">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border border-edge-strong px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-page disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !targetUserId}
              className="rounded-md bg-coral-600 px-4 py-2 text-sm font-medium text-white hover:bg-coral-700 disabled:opacity-50"
            >
              {submitting ? 'Starting…' : 'Start Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
