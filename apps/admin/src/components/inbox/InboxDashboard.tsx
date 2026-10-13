'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { QuickFilterTabs } from '@propertypro/ui';

import {
  SUPPORT_MAILBOXES,
  SUPPORT_THREAD_STATUSES,
  SUPPORT_THREAD_STATUS_LABELS,
} from '@propertypro/shared';

import type { InboxOverview } from '@/lib/server/inbox';

import { InboxSplit } from './InboxSplit';
import { MailboxSwitcher } from './MailboxSwitcher';
import { ThreadList } from './ThreadList';

interface InboxDashboardProps {
  overview: InboxOverview;
  /** The thread rendered by `detail`, so its row can be highlighted in the list. */
  activeThreadId?: number;
  /** `/inbox/[threadId]` passes the sanitized `ThreadView`; `/inbox` passes nothing. */
  detail?: ReactNode;
}

/**
 * The status the inbox opens on when the URL does not say otherwise.
 *
 * NOT 'all'. `StatusControl` describes `spam` as "a shelf" whose threads
 * "leave the default list", and with an 'all' default that was simply untrue —
 * shelving a thread changed a chip and nothing else, so an inbox whose entire
 * history had been triaged as spam still rendered as a wall of spam. Opening on
 * the work queue is what makes the shelf a shelf.
 *
 * Exported because `ThreadList` must not spell it independently: its row
 * links omit `status` exactly when it equals this value, so the two must agree
 * or opening a thread silently changes the filter.
 */
export const INBOX_DEFAULT_STATUS = 'open';

/**
 * `?mailbox=` / `?status=` are untrusted input — a bookmark, a shared link, a
 * hand-edited URL — so each is validated against its known list and falls back
 * to a caller-supplied default, the same discipline `ClientWorkspace` applies
 * to `?tab=`. Without it, `?mailbox=foo` rendered an empty thread list with no
 * active chip and no explanation: nothing matched the filter, and no tab was
 * highlighted to say which filter was in force.
 */
function knownOr(value: string, allowed: readonly string[], fallback = 'all'): string {
  return allowed.includes(value) ? value : fallback;
}

/**
 * Composes the mailbox switcher, the status tabs and the master-detail split.
 *
 * Filtering happens entirely client-side, over the ONE unfiltered load
 * `getInboxOverview` already did (up to `PLATFORM_LIST_LIMIT`) — no fetch, no
 * loading spinner. The selection is mirrored into the URL (`?mailbox=&status=`)
 * so it survives a reload, a bookmark, and a thread navigation (`ThreadList`
 * links carry the current query forward).
 *
 * Written with `window.history.replaceState`, not `router.replace`: both inbox
 * pages are force-dynamic and read these params only to seed the initial state,
 * so a router navigation re-ran the whole page on the server on every click to
 * produce what was already on screen. Next syncs `replaceState` into its router
 * state, so Back and a later navigation still see the current URL.
 *
 * Which is why the filters are seeded from that URL (`useSearchParams`), not
 * from a value the server page read. Back restores the page from the router
 * cache — the payload rendered BEFORE any tab click — so a server-passed seed
 * came back stale: the address bar said `?status=closed` while Open was the
 * highlighted tab. `ClientWorkspace` reads `?tab=` the same way.
 */
export function InboxDashboard({ overview, activeThreadId, detail }: InboxDashboardProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mailbox, setMailbox] = useState(() =>
    knownOr(searchParams.get('mailbox') ?? 'all', SUPPORT_MAILBOXES),
  );
  const [status, setStatus] = useState(() =>
    knownOr(
      searchParams.get('status') ?? INBOX_DEFAULT_STATUS,
      [...SUPPORT_THREAD_STATUSES, 'all'],
      INBOX_DEFAULT_STATUS,
    ),
  );

  function updateFilters(next: { mailbox?: string; status?: string }) {
    const nextMailbox = next.mailbox ?? mailbox;
    const nextStatus = next.status ?? status;
    setMailbox(nextMailbox);
    setStatus(nextStatus);

    // Omit a param only when it equals what the SERVER will default to on the
    // next load. 'all' is no longer that value for status, so it must be
    // written explicitly — otherwise clicking "All" produces a bare /inbox URL
    // that reopens filtered to 'open', and the tab silently un-picks itself.
    const params = new URLSearchParams();
    if (nextMailbox !== 'all') params.set('mailbox', nextMailbox);
    if (nextStatus !== INBOX_DEFAULT_STATUS) params.set('status', nextStatus);
    const query = params.toString();
    window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
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
        list={
          <ThreadList
            threads={filtered}
            activeThreadId={activeThreadId}
            truncated={overview.truncated}
            mailbox={mailbox}
            status={status}
          />
        }
        detail={detail ?? null}
      />
    </div>
  );
}
