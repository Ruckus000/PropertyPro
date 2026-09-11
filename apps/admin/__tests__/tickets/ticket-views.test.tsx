// @vitest-environment jsdom
/**
 * The queue's list, its row and its detail pane — the states that are easy to
 * get wrong and invisible when they are.
 *
 * - The empty state must NOT promise a retention period. The plan's copy said
 *   resolved tickets are "kept for 12 months"; nothing in this repo implements
 *   retention, so that sentence would be a data-handling promise the code
 *   cannot keep. What is left is verifiable and is asserted here.
 * - A row must be readable without colour: priority and status are WORDS, not
 *   just tinted chips (`.claude/rules/design.md`).
 * - A failed triage PATCH must ROLL THE CONTROL BACK. A select that keeps the
 *   new value after the write failed leaves the screen asserting a state the
 *   database does not have — an operator believes a ticket is resolved.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/tickets',
}));

import { TicketDetail } from '@/components/tickets/TicketDetail';
import { TicketList } from '@/components/tickets/TicketList';
import { TicketSplit } from '@/components/tickets/TicketSplit';
import type { AdminTicket, TicketEvent } from '@/lib/server/tickets';

function ticket(over: Partial<AdminTicket> = {}): AdminTicket {
  return {
    id: 118,
    key: 'T-118',
    title: 'Cannot upload 2025 budget PDF',
    description: 'Upload returns a 500 on files over 8MB.',
    priority: 'high',
    category: 'billing',
    status: 'waiting',
    communityId: 4,
    communityName: 'Sunset Condos',
    threadId: 12,
    threadSubject: 'Budget upload keeps failing',
    externalRef: null,
    assigneeUserId: 'a1b2',
    assigneeEmail: 'ops@getpropertypro.com',
    createdBy: 'a1b2',
    resolvedAt: null,
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-02T09:00:00.000Z',
    ageLabel: '9 days',
    ...over,
  };
}

const events: TicketEvent[] = [
  {
    id: 1,
    kind: 'created',
    body: null,
    actorUserId: 'a1b2',
    actorEmail: 'ops@getpropertypro.com',
    createdAt: '2026-09-01T09:00:00.000Z',
  },
  {
    id: 2,
    kind: 'note',
    body: 'Reproduced with a 9MB file.',
    actorUserId: 'a1b2',
    actorEmail: 'ops@getpropertypro.com',
    createdAt: '2026-09-02T09:00:00.000Z',
  },
];

function okFetch() {
  global.fetch = vi.fn(
    async () => new Response(JSON.stringify({ data: {} }), { status: 200 }),
  ) as unknown as typeof fetch;
}

describe('TicketList empty states', () => {
  // Two cases, not one, and the order matters: a single test asserting the
  // replacement copy FIRST would redden on that assertion when the retention
  // promise is reinstated, so the failure would not name the thing being
  // guarded. Split, the ban fails on its own terms.
  it('makes no retention promise', () => {
    render(<TicketList tickets={[]} truncated={false} status="all" queueIsEmpty />);

    // The plan's copy was "Resolved tickets are kept for 12 months and
    // searchable from ⌘K." Nothing implements retention — no purge cron, no
    // `resolved_at` sweep — so that half is a data-handling promise the code
    // cannot keep.
    expect(document.body.textContent).not.toMatch(/12 months/i);
    expect(document.body.textContent).not.toMatch(/\bkept for\b/i);
    expect(document.body.textContent).not.toMatch(/retention|retained/i);
  });

  it('keeps the half of the promise that is true', () => {
    render(<TicketList tickets={[]} truncated={false} status="all" queueIsEmpty />);

    // Verifiable: nothing deletes a resolved ticket, and `search/tickets.ts`
    // deliberately does not exclude resolved rows from the palette.
    const description = screen.getByText(/searchable from ⌘K/i);
    expect(description.textContent).toMatch(/Nothing deletes a resolved ticket/i);
  });

  it('distinguishes "no tickets at all" from "none in this tab"', () => {
    render(<TicketList tickets={[]} truncated={false} status="resolved" queueIsEmpty={false} />);

    expect(screen.getByText(/no resolved tickets/i)).toBeTruthy();
    // The constructive action belongs on the genuinely empty queue, not here:
    // "New ticket" is the wrong next step when the fix is to change tab.
    expect(screen.queryByRole('link', { name: /new ticket/i })).toBeNull();
  });

  it('warns when the cap hid older tickets', () => {
    render(<TicketList tickets={[ticket()]} truncated status="all" queueIsEmpty={false} />);
    expect(screen.getByText(/most recently updated tickets only/i)).toBeTruthy();
  });
});

describe('TicketRow', () => {
  it('states priority and status in words, never colour alone', () => {
    render(<TicketList tickets={[ticket()]} truncated={false} status="all" queueIsEmpty={false} />);

    const row = screen.getByRole('link', { name: /cannot upload/i });
    expect(within(row).getByText('High')).toBeTruthy();
    expect(within(row).getByText('Waiting')).toBeTruthy();
    expect(within(row).getByText('Billing')).toBeTruthy();
    expect(within(row).getByText('Sunset Condos')).toBeTruthy();
  });

  it('carries the active status filter into the row link, and omits it on All', () => {
    const { unmount } = render(
      <TicketList tickets={[ticket()]} truncated={false} status="waiting" queueIsEmpty={false} />,
    );
    expect(screen.getByRole('link', { name: /cannot upload/i }).getAttribute('href')).toBe(
      '/tickets/118?status=waiting',
    );
    unmount();

    render(<TicketList tickets={[ticket()]} truncated={false} status="all" queueIsEmpty={false} />);
    expect(screen.getByRole('link', { name: /cannot upload/i }).getAttribute('href')).toBe(
      '/tickets/118',
    );
  });

  it('marks the open ticket as the current page', () => {
    render(
      <TicketList
        tickets={[ticket(), ticket({ id: 200, key: 'T-200', title: 'Other work' })]}
        activeTicketId={200}
        truncated={false}
        status="all"
        queueIsEmpty={false}
      />,
    );
    expect(screen.getByRole('link', { name: /other work/i }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      screen.getByRole('link', { name: /cannot upload/i }).getAttribute('aria-current'),
    ).toBeNull();
  });

  it('names an unassigned ticket for assistive tech rather than showing a bare circle', () => {
    render(
      <TicketList
        tickets={[ticket({ assigneeUserId: null, assigneeEmail: null })]}
        truncated={false}
        status="all"
        queueIsEmpty={false}
      />,
    );
    expect(screen.getByText('Unassigned')).toBeTruthy();
  });
});

/** The split's two grid columns, with the assertions TS needs to index them. */
function panes(container: HTMLElement): { listPane: Element; detailPane: Element } {
  const grid = container.firstElementChild;
  if (!grid || grid.children.length !== 2) {
    throw new Error(`expected a two-column split, got ${grid?.children.length ?? 'nothing'}`);
  }
  const [listPane, detailPane] = Array.from(grid.children);
  if (!listPane || !detailPane) throw new Error('missing a split pane');
  return { listPane, detailPane };
}

describe('TicketSplit', () => {
  it('keeps the list visible on a phone when nothing is selected', () => {
    const { container } = render(<TicketSplit list={<p>queue</p>} detail={null} />);

    const { listPane, detailPane } = panes(container);
    // Below `md` exactly one column shows. With no detail that must be the list,
    // or a phone gets neither a ticket nor a queue.
    expect(listPane.className).not.toMatch(/\bhidden\b/);
    expect(detailPane.className).toMatch(/\bhidden\b/);
    expect(screen.getByText(/select a ticket/i)).toBeTruthy();
  });

  it('hides the list behind the detail on a phone when one is open', () => {
    const { container } = render(<TicketSplit list={<p>queue</p>} detail={<p>one ticket</p>} />);

    const { listPane, detailPane } = panes(container);
    expect(listPane.className).toMatch(/\bhidden\b/);
    expect(detailPane.className).not.toMatch(/\bhidden\b/);
  });
});

describe('TicketDetail', () => {
  it('renders the ticket, its links and its timeline', () => {
    okFetch();
    render(<TicketDetail ticket={ticket()} events={events} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Cannot upload 2025 budget PDF',
    );
    expect(
      screen.getByRole('link', { name: /budget upload keeps failing/i }).getAttribute('href'),
    ).toBe('/inbox/12');
    expect(screen.getByRole('link', { name: /sunset condos/i }).getAttribute('href')).toBe(
      '/clients/4',
    );
    expect(screen.getByText('Reproduced with a 9MB file.')).toBeTruthy();
  });

  it('says so plainly when a ticket has no description and no history', () => {
    okFetch();
    render(<TicketDetail ticket={ticket({ description: null })} events={[]} />);

    expect(screen.getByText(/no description was written/i)).toBeTruthy();
    expect(screen.getByText(/nothing has happened to this ticket yet/i)).toBeTruthy();
  });

  it('keeps an optimistic status change that the server accepted', async () => {
    okFetch();
    render(<TicketDetail ticket={ticket()} events={events} />);

    const status = screen.getByLabelText('Status') as HTMLSelectElement;
    fireEvent.change(status, { target: { value: 'resolved' } });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(status.value).toBe('resolved');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rolls the status back and surfaces the server message when the PATCH fails', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'Ticket not found' } }), { status: 404 }),
    ) as unknown as typeof fetch;

    render(<TicketDetail ticket={ticket()} events={events} />);

    const status = screen.getByLabelText('Status') as HTMLSelectElement;
    fireEvent.change(status, { target: { value: 'resolved' } });

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Ticket not found'));
    expect(status.value).toBe('waiting');
  });

  it('offers no Resolve action on a ticket that is already resolved', () => {
    okFetch();
    render(
      <TicketDetail
        ticket={ticket({ status: 'resolved', resolvedAt: '2026-09-03T09:00:00.000Z' })}
        events={events}
      />,
    );
    expect(screen.queryByRole('button', { name: /resolve ticket/i })).toBeNull();
  });
});
