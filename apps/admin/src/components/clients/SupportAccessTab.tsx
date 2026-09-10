'use client';

/**
 * Support Access Tab — client workspace Support tab (restyled, task 17c).
 *
 * Selectors this file must NOT change — `apps/web/e2e/support-access.spec.ts`
 * drives them directly: `role="tab"` name `Support` (owned by `ClientWorkspace`,
 * not this file), headings `Support Sessions` / `Access Log`, buttons
 * `Start Session` / `End Session`, and the `StartSessionDialog`'s
 * `role="dialog"`. See task-17c-dispatch-notes.md §3 — the brief's own
 * "keep heading text Support Access" note targets a DIFFERENT app (apps/web's
 * settings page), not this component, which has no such heading.
 *
 * `?start=1` auto-open: 17a wired `WorkspaceHeader`'s "Start support session"
 * action to navigate to `?tab=support&start=1`, but the dialog never opened
 * automatically. Read once on mount (this component only mounts when the
 * Support tab is active — see `ClientWorkspace`'s conditional render) and
 * strip the flag from the address bar immediately so re-mounting this same
 * tab (e.g. switching away and back) cannot reopen it after the operator
 * dismissed it.
 */
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Loader2, Plus, X, ShieldCheck } from 'lucide-react';
import { AlertBanner, Button, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@propertypro/ui';
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
  const searchParams = useSearchParams();
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

  // Runs once per mount. This component only mounts while the Support tab is
  // active, so a fresh `?tab=support&start=1` navigation always remounts it —
  // no need to react to `searchParams` changing under a live mount.
  useEffect(() => {
    if (searchParams.get('start') === '1') {
      setDialogOpen(true);
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('start');
        const path = window.location.pathname;
        const query = params.toString();
        window.history.replaceState(null, '', query ? `${path}?${query}` : path);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only, see docblock
  }, []);

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
        <Loader2 size={20} className="animate-spin text-content-disabled" aria-hidden="true" />
      </div>
    );
  }

  if (error) {
    return <AlertBanner status="danger" title="Couldn't load support sessions" description={error} />;
  }

  return (
    <div className="space-y-6">
      {/* Active sessions. The session list is rendered as a SIBLING of
          AlertBanner, not inside its `description` prop — that prop renders
          inside a `<p>`, and this list's buttons/divs are block content that
          is invalid nested inside a paragraph (silently mangled DOM nesting,
          a React hydration warning). */}
      {activeSessions.length > 0 && (
        <div className="space-y-3">
          <AlertBanner
            status="warning"
            title={`${activeSessions.length} active support session${activeSessions.length !== 1 ? 's' : ''}`}
          />
          <div className="space-y-2">
            {activeSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-md border border-edge bg-surface-card p-3 text-sm text-content"
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleEndSession(session.id)}
                  disabled={endingId === session.id}
                  className="ml-4 border-status-danger-border text-status-danger hover:bg-status-danger-bg"
                >
                  {endingId === session.id ? (
                    <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <X size={12} aria-hidden="true" />
                  )}
                  End Session
                </Button>
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
        <Button type="button" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={14} aria-hidden="true" />
          Start Session
        </Button>
      </div>

      {/* Recent sessions table */}
      <Card>
        <CardHeader className="border-b border-edge-subtle">
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-content-tertiary">
            Recent Sessions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentSessions.length > 0 ? (
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
          ) : (
            <div className="p-6">
              <EmptyState
                icon={ShieldCheck}
                size="sm"
                title="No support sessions have been started yet"
                description="Sessions this admin console starts for this community will show up here."
              />
            </div>
          )}
        </CardContent>
      </Card>

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
