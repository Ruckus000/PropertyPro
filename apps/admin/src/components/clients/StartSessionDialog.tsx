'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { SUPPORT_SESSION_COOKIE } from '@propertypro/shared';

interface Member {
  user_id: string;
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

      const token: string = data.token;
      // Derive root domain for cross-subdomain cookie (supports any TLD/staging)
      const hostname = window.location.hostname;
      const parts = hostname.split('.');
      const rootDomain = parts.length >= 2 ? parts.slice(-2).join('.') : '';
      const cookieDomain = hostname === 'localhost' || !rootDomain ? '' : `; domain=.${rootDomain}`;

      document.cookie = `${SUPPORT_SESSION_COOKIE}=${token}; path=/; max-age=3600; SameSite=Lax; Secure${cookieDomain}`;

      const tenantUrl = hostname === 'localhost'
        ? `http://localhost:3000/dashboard?communityId=${communityId}`
        : `https://${communitySlug}.${rootDomain}/dashboard`;

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
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 id="start-session-title" className="text-base font-semibold text-gray-900">
            Start Support Session
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
            aria-label="Close dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Warning banner */}
        <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
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
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Impersonate user <span aria-hidden="true">*</span>
            </label>
            <select
              id="target-user"
              required
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a member…</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.email} ({m.role})
                </option>
              ))}
            </select>
          </div>

          {/* Reason */}
          <div>
            <label
              htmlFor="session-reason"
              className="mb-1 block text-sm font-medium text-gray-700"
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
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Ticket ID */}
          <div>
            <label
              htmlFor="ticket-id"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Ticket ID <span className="text-gray-400">(optional)</span>
            </label>
            <input
              id="ticket-id"
              type="text"
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              placeholder="e.g. SUPPORT-1234"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !targetUserId}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Starting…' : 'Start Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
