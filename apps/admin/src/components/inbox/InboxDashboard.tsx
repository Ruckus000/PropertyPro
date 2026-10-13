'use client';

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  usePathname,
  useRouter,
  useSearchParams,
  useSelectedLayoutSegment,
} from 'next/navigation';
import { QuickFilterTabs } from '@propertypro/ui';

import {
  SUPPORT_MAILBOXES,
  SUPPORT_THREAD_STATUSES,
  SUPPORT_THREAD_STATUS_LABELS,
} from '@propertypro/shared';

import type { InboxOverview } from '@/lib/server/inbox';

import { INBOX_DEFAULT_STATUS } from './inbox-filters';
import { InboxSplit } from './InboxSplit';
import { MailboxSwitcher } from './MailboxSwitcher';
import { ThreadList } from './ThreadList';

interface InboxDashboardProps {
  overview: InboxOverview;
  /** The page header, shown only while no thread is open (`ThreadView` owns that `<h1>`). */
  header?: ReactNode;
  /** The layout's `children`: the open thread on `/inbox/[threadId]`, nothing on `/inbox`. */
  children?: ReactNode;
}

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
 * Which is why the filters are READ from that URL (`useSearchParams`) on every
 * render, with no state of their own. Two things depend on it. Back restores a
 * page from the router cache, rendered BEFORE any tab click, so a server-read
 * seed came back stale. And this component lives in `(split)/layout.tsx`, which
 * stays mounted from `/inbox` to `/inbox/7` and back: state seeded once would
 * drift from the URL (ThreadView's "Back to inbox" link is a bare `/inbox`).
 *
 * It lives in the layout so a row click renders only the thread: the list, its
 * load and its filters stay put, and `(split)/loading.tsx` fills only the
 * detail pane. The open thread is the layout's selected segment.
 *
 * The price of a layout is that Next never re-renders it on a navigation
 * between its own children, so the list would otherwise stay as it was when the
 * inbox was entered. It is re-read when a thread CLOSES (see the effect below),
 * on `router.refresh()` — which every inbox mutation calls — and on any entry
 * from outside the inbox. Moving from one thread to the next stays free.
 */
export function InboxDashboard({ overview, header, children }: InboxDashboardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  // `null` on `/inbox` itself; the `[threadId]` value on a thread.
  const segment = useSelectedLayoutSegment();

  // Back to the list ("Back to inbox", the rail, Back): re-read it once. Before
  // the list moved into a layout, that navigation re-rendered the list page and
  // so re-read it; without this, mail that arrived while a thread was open
  // never appeared, and a thread deleted elsewhere stayed listed.
  const previousSegment = useRef(segment);
  useEffect(() => {
    if (previousSegment.current !== null && segment === null) router.refresh();
    previousSegment.current = segment;
  }, [segment, router]);
  const activeThreadId = segment === null ? undefined : Number(segment);
  const detail = segment === null ? null : children;
  const mailbox = knownOr(searchParams.get('mailbox') ?? 'all', SUPPORT_MAILBOXES);
  const status = knownOr(
    searchParams.get('status') ?? INBOX_DEFAULT_STATUS,
    [...SUPPORT_THREAD_STATUSES, 'all'],
    INBOX_DEFAULT_STATUS,
  );

  function updateFilters(next: { mailbox?: string; status?: string }) {
    const nextMailbox = next.mailbox ?? mailbox;
    const nextStatus = next.status ?? status;

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
      {/* pb-2: with this column's space-y-4, the 24px gap PageBody gave the
          header when it sat outside. */}
      {detail ? null : <div className="pb-2">{header}</div>}
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
