'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Archive, CheckCircle2, Clock, Inbox as InboxIcon, Loader2, Ban } from 'lucide-react';

import {
  SUPPORT_MAILBOXES,
  SUPPORT_MAILBOX_LABELS,
  SUPPORT_THREAD_STATUSES,
  SUPPORT_THREAD_STATUS_LABELS,
  type SupportThreadStatus,
} from '@propertypro/shared';

import type { InboxStats, InboxThread } from '@/lib/server/inbox';

interface InboxDashboardProps {
  initialThreads: InboxThread[];
  initialStats: InboxStats;
  initialTruncated: boolean;
  initialMailboxFilter?: string;
  initialStatusFilter?: string;
}

const MUTED = 'text-content-tertiary';
const FAINT = 'text-content-disabled';
const CELL = 'px-4 py-3';
const INPUT = 'rounded-md border border-edge-strong';

const STATUS_STYLES: Record<
  SupportThreadStatus,
  { className: string; icon: typeof Clock }
> = {
  open: { className: 'bg-status-info-subtle text-status-info', icon: InboxIcon },
  pending: { className: 'bg-status-warning-subtle text-status-warning', icon: Clock },
  closed: { className: 'bg-status-success-subtle text-status-success', icon: CheckCircle2 },
  spam: { className: 'bg-surface-muted text-content-secondary', icon: Ban },
};

export function InboxDashboard({
  initialThreads,
  initialStats,
  initialTruncated,
  initialMailboxFilter = 'all',
  initialStatusFilter = 'all',
}: InboxDashboardProps) {
  const [threads, setThreads] = useState(initialThreads);
  const [stats, setStats] = useState(initialStats);
  const [truncated, setTruncated] = useState(initialTruncated);
  const [mailbox, setMailbox] = useState(initialMailboxFilter);
  const [status, setStatus] = useState(initialStatusFilter);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Skip the first run: the server already rendered this exact filter, so
  // refetching on mount would double every page load for no new data.
  const hasHydrated = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (mailbox !== 'all') params.set('mailbox', mailbox);
      if (status !== 'all') params.set('status', status);

      const response = await fetch(`/api/admin/inbox?${params.toString()}`);
      if (!response.ok) throw new Error('Request failed');

      const data = (await response.json()) as {
        threads: InboxThread[];
        stats: InboxStats;
        truncated: boolean;
      };
      setThreads(data.threads);
      setStats(data.stats);
      setTruncated(data.truncated);
    } catch {
      setError('We could not refresh the inbox. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [mailbox, status]);

  useEffect(() => {
    if (!hasHydrated.current) {
      hasHydrated.current = true;
      return;
    }
    void refresh();
  }, [refresh]);

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(['open', 'pending', 'closed', 'spam'] as const).map((key) => (
          <div key={key} className="rounded-lg border border-edge bg-surface-card p-4">
            <p className={`text-xs uppercase tracking-wide ${MUTED}`}>
              {SUPPORT_THREAD_STATUS_LABELS[key]}
            </p>
            <p className="mt-1 text-2xl font-semibold text-content">{stats[key]}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-content-secondary">
          Mailbox
          <select
            value={mailbox}
            onChange={(event) => setMailbox(event.target.value)}
            className={`${INPUT} px-2 py-1 text-sm`}
          >
            <option value="all">All</option>
            {SUPPORT_MAILBOXES.map((value) => (
              <option key={value} value={value}>
                {SUPPORT_MAILBOX_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
          {(['all', ...SUPPORT_THREAD_STATUSES] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              aria-pressed={status === value}
              className={`rounded-full px-3 py-1 text-sm ${
                status === value
                  ? 'bg-interactive text-content-inverse'
                  : 'bg-surface-muted text-content-secondary hover:bg-surface-hover'
              }`}
            >
              {value === 'all' ? 'All' : SUPPORT_THREAD_STATUS_LABELS[value]}
            </button>
          ))}
        </div>

        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-content-tertiary" aria-label="Loading" />
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-md border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-status-danger"
        >
          {error}
        </div>
      ) : null}

      {truncated ? (
        <p className={`mb-3 text-sm ${MUTED}`}>
          Showing the most recent threads only — narrow the filters to see older ones.
        </p>
      ) : null}

      {threads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-edge bg-surface-card p-10 text-center">
          <Archive className="mx-auto mb-3 h-6 w-6 text-content-tertiary" aria-hidden="true" />
          <p className="font-medium text-content">Nothing here yet</p>
          <p className={`mt-1 text-sm ${MUTED}`}>
            Mail sent to support@, privacy@ and contact@ will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-edge bg-surface-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-edge bg-surface-muted">
              <tr className={`text-xs uppercase tracking-wide ${MUTED}`}>
                <th className={CELL}>Subject</th>
                <th className={CELL}>From</th>
                <th className={CELL}>Mailbox</th>
                <th className={CELL}>Status</th>
                <th className={CELL}>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {threads.map((thread) => {
                const style = STATUS_STYLES[thread.status];
                const StatusIcon = style.icon;
                return (
                  <tr
                    key={thread.id}
                    className="border-b border-edge-subtle last:border-0 hover:bg-surface-hover"
                  >
                    <td className={CELL}>
                      <Link
                        href={`/inbox/${thread.id}`}
                        className="font-medium text-content hover:underline"
                      >
                        {thread.subject}
                      </Link>
                      <span className={`ml-2 text-xs ${FAINT}`}>
                        {thread.messageCount} message{thread.messageCount === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td className={CELL}>
                      <span className="text-content">{thread.participantName ?? '—'}</span>
                      <span className={`block text-xs ${MUTED}`}>{thread.participantEmail}</span>
                    </td>
                    <td className={CELL}>
                      <span className={MUTED}>{thread.mailboxLabel}</span>
                    </td>
                    <td className={CELL}>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}
                      >
                        <StatusIcon className="h-3 w-3" aria-hidden="true" />
                        {SUPPORT_THREAD_STATUS_LABELS[thread.status]}
                      </span>
                    </td>
                    <td className={`${CELL} ${MUTED}`}>
                      {format(new Date(thread.lastMessageAt), 'd MMM yyyy, HH:mm')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
