'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { QuickFilterTabs } from '@propertypro/ui';

import { SUPPORT_THREAD_STATUSES, SUPPORT_THREAD_STATUS_LABELS } from '@propertypro/shared';

import type { InboxOverview } from '@/lib/server/inbox';

import { InboxSplit } from './InboxSplit';
import { MailboxSwitcher } from './MailboxSwitcher';
import { ThreadList } from './ThreadList';

interface InboxDashboardProps {
  overview: InboxOverview;
  /** Initial values read from the URL (`?mailbox=&status=`) by the server page. */
  initialMailbox: string;
  initialStatus: string;
  /** The thread rendered by `detail`, so its row can be highlighted in the list. */
  activeThreadId?: number;
  /** `/inbox/[threadId]` passes the sanitized `ThreadView`; `/inbox` passes nothing. */
  detail?: ReactNode;
}

/**
 * Composes the mailbox switcher, the status tabs and the master-detail split.
 *
 * Filtering happens entirely client-side, over the ONE unfiltered load
 * `getInboxOverview` already did (up to `PLATFORM_LIST_LIMIT`) — no fetch, no
 * loading spinner. The selection is mirrored into the URL (`?mailbox=&status=`)
 * with `router.replace` so it survives a reload, a bookmark, and a thread
 * navigation (`ThreadList` links carry the current query forward).
 */
export function InboxDashboard({
  overview,
  initialMailbox,
  initialStatus,
  activeThreadId,
  detail,
}: InboxDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mailbox, setMailbox] = useState(initialMailbox);
  const [status, setStatus] = useState(initialStatus);

  function updateFilters(next: { mailbox?: string; status?: string }) {
    const nextMailbox = next.mailbox ?? mailbox;
    const nextStatus = next.status ?? status;
    setMailbox(nextMailbox);
    setStatus(nextStatus);

    const params = new URLSearchParams();
    if (nextMailbox !== 'all') params.set('mailbox', nextMailbox);
    if (nextStatus !== 'all') params.set('status', nextStatus);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const filtered = useMemo(
    () =>
      overview.threads.filter(
        (thread) =>
          (mailbox === 'all' || thread.mailbox === mailbox) &&
          (status === 'all' || thread.status === status),
      ),
    [overview.threads, mailbox, status],
  );

  const statusTabs = [
    { label: 'All', value: 'all', count: overview.stats.total },
    ...SUPPORT_THREAD_STATUSES.map((value) => ({
      label: SUPPORT_THREAD_STATUS_LABELS[value],
      value,
      count: overview.stats[value],
    })),
  ];

  return (
    <div className="space-y-4">
      {/* Hidden on mobile once a thread is open, so a small screen shows the
          thread and its Back link only — the switcher and tabs would otherwise
          push the open thread below the fold on a phone. */}
      <div className={detail ? 'hidden space-y-4 md:block' : 'space-y-4'}>
        <MailboxSwitcher overview={overview} active={mailbox} onChange={(value) => updateFilters({ mailbox: value })} />
        <QuickFilterTabs tabs={statusTabs} active={status} onChange={(value) => updateFilters({ status: value })} />
      </div>

      <InboxSplit
        list={<ThreadList threads={filtered} activeThreadId={activeThreadId} truncated={overview.truncated} />}
        detail={detail ?? null}
      />
    </div>
  );
}
