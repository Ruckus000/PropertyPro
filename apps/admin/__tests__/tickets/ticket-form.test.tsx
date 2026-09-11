// @vitest-environment jsdom
/**
 * TicketForm — the two things that make this form useful rather than decorative.
 *
 * 1. The link it was opened with survives the POST. `/tickets/new?thread=12`
 *    exists so an operator escalating a support thread does not retype anything;
 *    a form that dropped `threadId` would produce an unlinked ticket that looks
 *    correct and silently loses the connection to the conversation.
 * 2. A server rejection is SHOWN. The form deliberately has no client-side title
 *    check (the schema shared with the database's CHECK is the one validator),
 *    so a 400 that went nowhere would leave the operator clicking a button that
 *    appears to do nothing at all.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { TicketForm } from '@/components/tickets/TicketForm';

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetch(body: unknown, status: number): FetchMock {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as FetchMock;
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** The JSON body of the first POST, with the assertions TS needs to see it. */
function postedBody(fetchMock: FetchMock): Record<string, unknown> {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error('fetch was never called');
  const init = call[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /create ticket/i }));
}

describe('TicketForm', () => {
  it('posts the prefilled thread link and navigates to the new ticket', async () => {
    const fetchMock = mockFetch({ data: { id: 118 } }, 201);

    render(
      <TicketForm
        communities={[{ id: 1, name: 'Sunset Condos' }]}
        initial={{ title: 'Cannot upload 2025 budget PDF', threadId: 12 }}
      />,
    );
    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/tickets/118'));

    expect(postedBody(fetchMock)).toMatchObject({
      title: 'Cannot upload 2025 budget PDF',
      threadId: 12,
    });
  });

  it('carries the Sentry reference through as externalRef', async () => {
    const fetchMock = mockFetch({ data: { id: 9 } }, 201);

    render(<TicketForm communities={[]} initial={{ title: 'TypeError', externalRef: '4821' }} />);
    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/tickets/9'));

    expect(postedBody(fetchMock).externalRef).toBe('4821');
  });

  it('shows the server validation message inline', async () => {
    mockFetch({ error: { code: 'VALIDATION_ERROR', message: 'Title is required' } }, 400);

    render(<TicketForm communities={[]} initial={{}} />);
    submit();

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Title is required'),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('does not navigate when the network call throws (control)', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    render(<TicketForm communities={[]} initial={{ title: 'Something' }} />);
    submit();

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not reach/i));
    expect(push).not.toHaveBeenCalled();
  });
});
