'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { Archive, Ban, CheckCircle2, Clock, Inbox as InboxIcon } from 'lucide-react';
import { EmptyState } from '@propertypro/ui';

import { SUPPORT_THREAD_STATUS_LABELS, type SupportThreadStatus } from '@propertypro/shared';

import type { InboxThread } from '@/lib/server/inbox';

interface ThreadListProps {
  threads: InboxThread[];
  /** Highlights the open thread when this list sits next to a detail pane. */
  activeThreadId?: number;
  truncated: boolean;
  /** Current `?mailbox=&status=` filters, appended to each thread link so the
   *  detail page reopens with the same filters instead of resetting to All/All. */
  mailbox: string;
  status: string;
}

const STATUS_STYLES: Record<SupportThreadStatus, { className: string; icon: typeof Clock }> = {
  open: { className: 'bg-status-info-subtle text-status-info', icon: InboxIcon },
  pending: { className: 'bg-status-warning-subtle text-status-warning', icon: Clock },
  closed: { className: 'bg-status-success-subtle text-status-success', icon: CheckCircle2 },
  spam: { className: 'bg-surface-muted text-content-secondary', icon: Ban },
};

/**
 * The narrow-column thread list for the master-detail inbox. A vertical list
 * of rows, not a table — the column is `minmax(300px,380px)` (see
 * `InboxSplit`), too narrow for the old dashboard's five-column table.
 */
export function ThreadList({ threads, activeThreadId, truncated, mailbox, status }: ThreadListProps) {
  const params = new URLSearchParams();
  if (mailbox !== 'all') params.set('mailbox', mailbox);
  if (status !== 'all') params.set('status', status);
  const query = params.toString();

  if (threads.length === 0) {
    return (
      <EmptyState
        icon={Archive}
        title="Nothing here yet"
        description="Mail sent to support@, privacy@ and contact@ will appear here."
        size="sm"
      />
    );
  }

  return (
    <div className="rounded-lg border border-edge bg-surface-card">
      {truncated ? (
        <p className="border-b border-edge-subtle px-3 py-2 text-xs text-content-tertiary">
          Showing the most recent threads only — narrow the filters to see older ones.
        </p>
      ) : null}
      <ul className="max-h-[70vh] divide-y divide-edge-subtle overflow-y-auto">
        {threads.map((thread) => {
          const style = STATUS_STYLES[thread.status];
          const StatusIcon = style.icon;
          const isActive = thread.id === activeThreadId;
          return (
            <li key={thread.id}>
              <Link
                href={query ? `/inbox/${thread.id}?${query}` : `/inbox/${thread.id}`}
                aria-current={isActive ? 'true' : undefined}
                className={`block min-h-11 px-3 py-2.5 hover:bg-surface-hover md:min-h-9 ${
                  isActive ? 'bg-surface-muted' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-content">{thread.subject}</p>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium ${style.className}`}
                  >
                    <StatusIcon className="h-3 w-3" aria-hidden="true" />
                    {SUPPORT_THREAD_STATUS_LABELS[thread.status]}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-content-tertiary">
                  {thread.participantName ? `${thread.participantName} · ` : ''}
                  {thread.participantEmail}
                </p>
                <p className="mt-1 flex items-center justify-between text-xs text-content-disabled">
                  <span>{thread.mailboxLabel}</span>
                  <span>{format(new Date(thread.lastMessageAt), 'd MMM, HH:mm')}</span>
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
