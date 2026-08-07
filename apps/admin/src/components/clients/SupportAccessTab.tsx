'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { Loader2, AlertTriangle, Plus, X, ShieldCheck } from 'lucide-react';
import { AccessLogTable } from './AccessLogTable';
import { StartSessionDialog } from './StartSessionDialog';

interface SupportSession {
  id: number;
  admin_user_id: string;
  target_user_id: string;
  reason: string;
  ticket_id: string | null;
  started_at: string;
  ended_at: string | null;
  ended_reason: string | null;
}

interface Member {
  userId: string;
  email: string;
  role: string;
}

interface SupportAccessTabProps {
  communityId: number;
  communitySlug: string;
}

export function SupportAccessTab({ communityId, communitySlug }: SupportAccessTabProps) {
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [endingId, setEndingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sessionsRes, membersRes] = await Promise.all([
        fetch(`/api/admin/support/sessions?communityId=${communityId}`),
        fetch(`/api/admin/communities/${communityId}/members`),
      ]);

      const [sessionsData, membersData] = await Promise.all([
        sessionsRes.json(),
        membersRes.json(),
      ]);

      if (!sessionsRes.ok) {
        setError(typeof sessionsData.error === 'string' ? sessionsData.error : 'Failed to load sessions');
        return;
      }

      setSessions(sessionsData.sessions ?? []);
      setMembers(
        (membersData.members ?? []).map((member: { userId: string; email: string; role: string }) => ({
          userId: member.userId,
          email: member.email,
          role: member.role,
        })),
      );
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleEndSession = async (id: number) => {
    setEndingId(id);
    try {
      const res = await fetch(`/api/admin/support/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ended_reason: 'manual' }),
      });
      if (res.ok) {
        await fetchData();
      }
    } finally {
      setEndingId(null);
    }
  };

  const activeSessions = sessions.filter((s) => !s.ended_at);
  const recentSessions = sessions.filter((s) => s.ended_at);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 size={20} className="animate-spin text-content-disabled" />
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
      {/* Active sessions */}
      {activeSessions.length > 0 && (
        <div className="rounded-lg border border-status-warning-border bg-status-warning-bg p-4">
          <div className="mb-3 flex items-center gap-2 text-status-warning">
            <AlertTriangle size={16} aria-hidden="true" />
            <span className="text-sm font-semibold">
              {activeSessions.length} active support session{activeSessions.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {activeSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-md bg-surface-card p-3 text-sm"
              >
                <div>
                  <span className="font-medium text-content-secondary">
                    Admin {session.admin_user_id.slice(0, 8)}…
                  </span>
                  <span className="mx-2 text-content-disabled">·</span>
                  <span className="text-content-tertiary">{session.reason}</span>
                  {session.ticket_id && (
                    <span className="ml-2 font-mono text-xs text-content-disabled">
                      [{session.ticket_id}]
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleEndSession(session.id)}
                  disabled={endingId === session.id}
                  className="ml-4 flex items-center gap-1.5 rounded-md border border-status-danger-border px-3 py-1.5 text-xs font-medium text-status-danger hover:bg-status-danger-bg disabled:opacity-50"
                >
                  {endingId === session.id ? (
                    <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <X size={12} aria-hidden="true" />
                  )}
                  End Session
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Start session button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-content-secondary">
          <ShieldCheck size={16} aria-hidden="true" />
          <h2 className="text-sm font-semibold">Support Sessions</h2>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 rounded-md bg-coral-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-coral-700"
        >
          <Plus size={14} aria-hidden="true" />
          Start Session
        </button>
      </div>

      {/* Recent sessions table */}
      {recentSessions.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-edge bg-surface-card">
          <div className="border-b border-edge-subtle px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-content-tertiary">
              Recent Sessions
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-surface-page">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">
                  Admin
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">
                  Reason
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">
                  Started
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">
                  Ended
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge-subtle">
              {recentSessions.map((session) => (
                <tr key={session.id} className="hover:bg-surface-page">
                  <td className="px-4 py-3 font-mono text-xs text-content-secondary">
                    {session.admin_user_id.slice(0, 8)}…
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs text-content-secondary">
                    <span className="line-clamp-1">{session.reason}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-content-tertiary">
                    {format(new Date(session.started_at), 'MMM d, HH:mm')}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-content-tertiary">
                    {session.ended_at
                      ? format(new Date(session.ended_at), 'MMM d, HH:mm')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-edge bg-surface-card p-6 text-center">
          <ShieldCheck size={24} className="mx-auto mb-2 text-content-disabled" aria-hidden="true" />
          <p className="text-sm text-content-tertiary">No support sessions have been started yet.</p>
        </div>
      )}

      {/* Access log */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-content-secondary">Access Log</h2>
        <AccessLogTable communityId={communityId} />
      </div>

      <StartSessionDialog
        communityId={communityId}
        communitySlug={communitySlug}
        members={members}
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          fetchData();
        }}
      />
    </div>
  );
}
