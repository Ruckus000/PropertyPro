// @vitest-environment jsdom
/**
 * Switching a status tab must not re-render the page on the server.
 *
 * `/tickets` and `/tickets/[id]` are force-dynamic and read `?status=` only to
 * seed `TicketQueue`'s initial state; the queue filters client-side over the
 * one unfiltered `listTickets()` load. `router.replace` re-ran the page on every
 * click — on `/tickets/42` that was the middleware read, `getTicket`'s four
 * serial reads and `listTickets` again — to produce what was already on screen.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { routerReplace, url } = vi.hoisted(() => ({
  routerReplace: vi.fn(),
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
  useRouter: () => ({ replace: routerReplace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/tickets/42',
  useSearchParams: () => new URLSearchParams(url.search),
  useSelectedLayoutSegment: () => url.segment,
}));

import { TicketQueue } from '@/components/tickets/TicketQueue';
import type { TicketsResult } from '@/lib/server/tickets';

const RESULT = {
  tickets: [],
  counts: { open: 0, waiting: 0, resolved: 0 },
  truncated: false,
} as unknown as TicketsResult;

afterEach(() => {
  url.segment = null;
  routerReplace.mockReset();
  vi.restoreAllMocks();
});

describe('TicketQueue status tabs', () => {
  it('writes the filter into the URL without a server round trip', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    url.search = '';
    render(<TicketQueue result={RESULT} />);

    fireEvent.click(screen.getByRole('button', { name: /^Waiting/ }));

    expect(replaceState).toHaveBeenCalledWith(null, '', '/tickets/42?status=waiting');
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('drops the param for All, the value the server defaults to', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    url.search = 'status=waiting';
    render(<TicketQueue result={RESULT} />);

    fireEvent.click(screen.getByRole('button', { name: /^All/ }));

    expect(replaceState).toHaveBeenCalledWith(null, '', '/tickets/42');
  });
});

/** See inbox-dashboard.test.tsx: Back restores a payload rendered before the click. */
describe('TicketQueue filter seed', () => {
  it('opens on the status in the current URL', () => {
    url.search = 'status=resolved';
    render(<TicketQueue result={RESULT} />);
    expect(
      screen.getByRole('button', { name: /^Resolved/ }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('opens on All when the URL names none (control)', () => {
    url.search = '';
    render(<TicketQueue result={RESULT} />);
    expect(screen.getByRole('button', { name: /^All/ }).getAttribute('aria-pressed')).toBe('true');
  });
});

/**
 * The queue lives in `tickets/(split)/layout.tsx` so a row click renders only
 * the ticket. It learns which ticket is open from the layout's selected
 * segment, and shows the layout's `children` only when one is.
 */
describe('TicketQueue in the split layout', () => {
  const ONE = {
    tickets: [
      {
        id: 118,
        key: 'T-118',
        title: 'Cannot upload 2025 budget PDF',
        description: '',
        priority: 'high',
        category: 'billing',
        status: 'open',
        communityId: 4,
        communityName: 'Sunset Condos',
        threadId: null,
        threadSubject: null,
        externalRef: null,
        assigneeUserId: null,
        assigneeEmail: null,
        createdBy: 'a1b2',
        resolvedAt: null,
        createdAt: '2026-09-01T09:00:00.000Z',
        updatedAt: '2026-09-02T09:00:00.000Z',
        ageLabel: '9 days',
      },
    ],
    counts: { open: 1, waiting: 0, resolved: 0 },
    truncated: false,
  } as unknown as TicketsResult;

  function renderInLayout(segment: string | null) {
    url.search = '';
    url.segment = segment;
    return render(
      <TicketQueue result={ONE} header={<h1>Tickets</h1>}>
        {/* Always an element, as in Next: see inbox-dashboard.test.tsx. */}
        <article>Ticket body</article>
      </TicketQueue>,
    );
  }

  it('highlights the open ticket and shows it, without the page header', () => {
    renderInLayout('118');
    expect(
      screen.getByRole('link', { name: /budget pdf/i }).getAttribute('aria-current'),
    ).toBe('page');
    expect(screen.getByText('Ticket body')).toBeTruthy();
    // TicketDetail owns the <h1> on a ticket; a second one would be wrong.
    expect(screen.queryByRole('heading', { name: 'Tickets' })).toBeNull();
  });

  it('shows the header and the placeholder when no ticket is open (control)', () => {
    renderInLayout(null);
    expect(screen.getByRole('heading', { name: 'Tickets' })).toBeTruthy();
    expect(screen.getByText('Select a ticket')).toBeTruthy();
    expect(screen.queryByText('Ticket body')).toBeNull();
    expect(
      screen.getByRole('link', { name: /budget pdf/i }).getAttribute('aria-current'),
    ).toBeNull();
  });
});
