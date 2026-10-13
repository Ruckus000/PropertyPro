// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { routerReplace, routerRefresh, url } = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  routerRefresh: vi.fn(),
  url: { search: '', segment: null as string | null },
}));

vi.mock('next/link', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, refresh: routerRefresh }),
  usePathname: () => '/inbox',
  useSearchParams: () => new URLSearchParams(url.search),
  useSelectedLayoutSegment: () => url.segment,
}));

/** Render as if the address bar carried `search`; the dashboard reads it. */
function renderAt(search: string) {
  url.search = search;
  url.segment = null;
  return render(<InboxDashboard overview={OVERVIEW} />);
}

/**
 * Render as the `(split)` layout does: `segment` is the open thread's id (or
 * null on `/inbox`). `children` is ALWAYS an element, as in Next — on `/inbox`
 * it is the router subtree for a page that renders nothing — so the dashboard
 * must decide from the segment, not from whether children exist.
 */
function renderInLayout(segment: string | null, search = 'status=all') {
  url.search = search;
  url.segment = segment;
  return render(
    <InboxDashboard overview={OVERVIEW} header={<h1>Inbox</h1>}>
      <article>Thread body</article>
    </InboxDashboard>,
  );
}

import { InboxDashboard } from '@/components/inbox/InboxDashboard';
import type { InboxOverview } from '@/lib/server/inbox';

const THREAD = {
  id: 7,
  mailbox: 'privacy' as const,
  mailboxLabel: 'Privacy',
  subject: 'Please delete my account',
  participantEmail: 'k@example.com',
  participantName: null,
  status: 'pending' as const,
  messageCount: 2,
  firstMessageAt: '2026-09-01T00:00:00.000Z',
  lastMessageAt: '2026-09-02T00:00:00.000Z',
};

const OVERVIEW = {
  threads: [THREAD],
  truncated: false,
  stats: { total: 1, open: 0, pending: 1, closed: 0, spam: 0 },
  byMailbox: {
    support: { total: 0, open: 0, pending: 0, closed: 0, spam: 0 },
    privacy: { total: 1, open: 0, pending: 1, closed: 0, spam: 0 },
    contact: { total: 0, open: 0, pending: 0, closed: 0, spam: 0 },
  },
} as unknown as InboxOverview;

/**
 * `?mailbox=` / `?status=` come straight from the URL. Unvalidated,
 * `?mailbox=foo` matched no thread and highlighted no chip — an empty list with
 * nothing on screen saying which filter was in force.
 */
describe('InboxDashboard URL filter validation', () => {
  it('falls back to All for a mailbox that is not a real mailbox', () => {
    renderAt('mailbox=foo&status=all');

    // The thread is still listed, i.e. the bogus filter was not applied.
    expect(screen.getByRole('link', { name: /please delete my account/i })).toBeTruthy();
  });

  it('falls back to the DEFAULT status for one that is not a real status', () => {
    renderAt('status=banana');

    // The fallback is `INBOX_DEFAULT_STATUS` ('open'), not 'all' — the same
    // value `InboxDashboard` uses when `?status=` is absent, because a garbage
    // value and a missing one mean the same thing.
    //
    // The defect this whole describe block exists for was never "a thread got
    // filtered out"; it was "no tab is highlighted, so nothing on screen says
    // which filter is in force". That still holds: the Open tab is visibly
    // active, and this thread is `pending`, so its absence is explained.
    expect(
      screen.getByRole('button', { name: /^Open/ }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.queryByRole('link', { name: /please delete my account/i })).toBeNull();
  });

  it('honours an explicit status=all rather than forcing the default', () => {
    // The round-trip that makes the "All" tab usable: the client writes
    // `?status=all` explicitly precisely because omitting it would now mean
    // 'open'. If this regresses, clicking All appears to work and then silently
    // un-picks itself on the next load.
    renderAt('status=all');

    expect(screen.getByRole('link', { name: /please delete my account/i })).toBeTruthy();
  });

  it('still honours a real filter — an unmatched one hides the thread (control)', () => {
    renderAt('mailbox=support&status=all');

    // `support` IS a known mailbox, and this thread is in `privacy`, so an empty
    // list here is correct. Without this case the two above would pass even if
    // `knownOr` returned 'all' for everything.
    expect(screen.queryByRole('link', { name: /please delete my account/i })).toBeNull();
  });
});

/**
 * Switching a filter tab must not re-render the page on the server. The inbox
 * routes are force-dynamic, and the filtering happens in the dashboard over the
 * one unfiltered load. `router.replace` re-ran the server render (middleware
 * read, overview, and on `/inbox/[id]` the thread) on every click, to produce
 * what was already on screen. `history.replaceState` keeps the URL in step
 * without that round trip; the dashboard reads the filter back from the URL.
 */
describe('InboxDashboard filter tabs', () => {
  afterEach(() => {
    routerReplace.mockReset();
    vi.restoreAllMocks();
  });

  it('writes the filter into the URL without a server round trip', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    renderAt('status=all');

    fireEvent.click(screen.getByRole('button', { name: /^Closed/ }));

    expect(replaceState).toHaveBeenCalledWith(null, '', '/inbox?status=closed');
    expect(routerReplace).not.toHaveBeenCalled();
  });
});

/**
 * Back restores `/inbox` from the router cache: the payload rendered BEFORE the
 * tab click, which `history.replaceState` never refreshed. When the filter was
 * seeded from a value the server page read, that payload carried the old one,
 * so the address bar said `?status=closed` while Open was highlighted (seen in
 * the browser). Seeding from the URL makes the restored page agree with it.
 */
describe('InboxDashboard filter read from the URL', () => {
  it('opens on the filter in the current URL', () => {
    renderAt('status=closed');
    expect(
      screen.getByRole('button', { name: /^Closed/ }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('opens on the default when the URL names none (control)', () => {
    renderAt('');
    expect(
      screen.getByRole('button', { name: /^Open/ }).getAttribute('aria-pressed'),
    ).toBe('true');
  });
});

/**
 * The dashboard lives in `inbox/(split)/layout.tsx` so a row click renders only
 * the thread. It learns which thread is open from the layout's selected
 * segment, and shows the layout's `children` only when one is.
 */
describe('InboxDashboard in the split layout', () => {
  it('highlights the open thread and shows it, without the page header', () => {
    renderInLayout('7');
    expect(
      screen.getByRole('link', { name: /please delete my account/i }).getAttribute('aria-current'),
    ).toBe('page');
    expect(screen.getByText('Thread body')).toBeTruthy();
    // ThreadView owns the <h1> on a thread; a second one would be wrong.
    expect(screen.queryByRole('heading', { name: 'Inbox' })).toBeNull();
  });

  it('shows the header and the placeholder when no thread is open (control)', () => {
    renderInLayout(null);
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeTruthy();
    expect(screen.getByText('Select a thread')).toBeTruthy();
    expect(screen.queryByText('Thread body')).toBeNull();
    expect(
      screen.getByRole('link', { name: /please delete my account/i }).getAttribute('aria-current'),
    ).toBeNull();
  });
});

/**
 * The list is a layout, which Next never re-renders on a navigation between its
 * own children. Going back from a thread to the list used to re-render the list
 * page — and so re-read the list — and must still re-read it: otherwise new mail
 * never appears and a thread deleted elsewhere stays listed. Moving thread to
 * thread must NOT, or the layout bought nothing.
 */
describe('InboxDashboard list freshness', () => {
  function mountAt(segment: string | null) {
    url.search = 'status=all';
    url.segment = segment;
    const view = render(
      <InboxDashboard overview={OVERVIEW}>
        <article>Thread body</article>
      </InboxDashboard>,
    );
    return (next: string | null) => {
      url.segment = next;
      view.rerender(
        <InboxDashboard overview={OVERVIEW}>
          <article>Thread body</article>
        </InboxDashboard>,
      );
    };
  }

  afterEach(() => routerRefresh.mockReset());

  it('re-reads the list once when a thread closes', () => {
    const goTo = mountAt('7');
    goTo(null);
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not re-read it moving thread to thread, or on first mount (control)', () => {
    const goTo = mountAt(null);
    goTo('7');
    goTo('5');
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
