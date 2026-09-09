// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The palette debounces its server fetch by 150ms (AdminCommandPalette.tsx's
// DEBOUNCE_MS). Real timers are used here (rather than vi.useFakeTimers())
// because the abort-race test below needs manually-resolvable Promises to
// control fetch resolution ORDER, independent of elapsed time; mixing fake
// timers with RTL's waitFor (which polls on real timers) is its own trap.
const DEBOUNCE_WAIT_MS = 200;

// cmdk's Command.List measures itself with a ResizeObserver, which jsdom does
// not implement. Same shim apps/web already uses for Radix components in jsdom
// (see apps/web/__tests__/access-requests/request-access-form.test.tsx).
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// cmdk also scrolls the selected item into view on every render, which jsdom
// (no real layout) does not implement either.
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
import { AdminCommandPalette } from '@/components/shell/AdminCommandPalette';

describe('AdminCommandPalette', () => {
  it('lists pages immediately and merges server hits after typing', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ key: 'clients', label: 'Clients', hits: [{ id: '1', label: 'Sunset Condos', meta: 'Condo §718', href: '/clients/1', icon: 'building' }] }] }))) as any;
    render(<AdminCommandPalette open onOpenChange={() => {}} />);
    expect(screen.getByRole('option', { name: /deletion requests/i })).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sun' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /sunset condos/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('option', { name: /sunset condos/i }));
    expect(push).toHaveBeenCalledWith('/clients/1');
  });

  it('renders exactly one "Pages" heading for a query that matches a nav label', async () => {
    // "bill" substring-matches the nav label "Billing". Before the fix, the
    // server's SEARCHERS list also included a pageSearcher over NAV_PAGES,
    // so the fetched response carried its own "pages" group alongside this
    // component's client-side one — two "Pages" headings, same query. The
    // mocked response here is what the FIXED search backend actually
    // returns for a page-only match: no matching DB rows, so an empty
    // groups array (search.test.ts's "SEARCHERS covers exactly the three
    // DB-backed groups" test is the one that pins that server-side fact —
    // this test is the client-side half: given that response, exactly one
    // "Pages" heading must render).
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ data: [] }))) as any;
    render(<AdminCommandPalette open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bill' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /billing/i })).toBeTruthy());
    expect(screen.getAllByText('Pages')).toHaveLength(1);
  });

  it('keeps a server hit visible that cmdk’s own fuzzy matcher would reject, proving shouldFilter={false} is load-bearing', async () => {
    // cmdk registers each CommandItem's match value from its `value` prop —
    // here that's `hit.id` ("community-9"), not the visible label. Neither
    // "community-9" nor "Bayview Gardens" contains a "z" or a "q", so cmdk's
    // fuzzy scorer (a character-subsequence match) can never score this item
    // above zero for the query "zq" — deliberately unlike the "sun" /
    // "Sunset Condos" pair used elsewhere in this file, which the task brief
    // flagged as a possible false-negative. Guarding against both the id and
    // the label means this stays a valid check even if a future refactor
    // changes which field cmdk matches on.
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                key: 'clients',
                label: 'Clients',
                hits: [{ id: 'community-9', label: 'Bayview Gardens', meta: 'HOA', href: '/clients/9', icon: 'building' }],
              },
            ],
          }),
        ),
    ) as any;
    render(<AdminCommandPalette open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zq' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /bayview gardens/i })).toBeTruthy());
  });

  it('does not let a slow, earlier response overwrite a faster, later one', async () => {
    let resolveFirst!: (r: Response) => void;
    let resolveSecond!: (r: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResponse = new Promise<Response>((resolve) => {
      resolveSecond = resolve;
    });

    global.fetch = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes('q=aaa')) return firstResponse;
      if (url.includes('q=bbb')) return secondResponse;
      throw new Error(`Unexpected fetch: ${url}`);
    }) as any;

    render(<AdminCommandPalette open onOpenChange={() => {}} />);
    const input = screen.getByRole('combobox');

    // Type the first query and let its debounce fire — the fetch for "aaa"
    // is now in flight (its promise stays pending).
    fireEvent.change(input, { target: { value: 'aaa' } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_WAIT_MS));
    });

    // Type a second query before the first ever resolves. The debounce
    // effect's cleanup fires `controller.abort()` on the first request's
    // AbortController — but the mocked fetch above does not itself honor
    // the signal, so this only tests the component's own
    // `if (controller.signal.aborted) return;` guard, not fetch-level
    // cancellation.
    fireEvent.change(input, { target: { value: 'bbb' } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_WAIT_MS));
    });

    // Resolve the SECOND (later, faster) request first.
    await act(async () => {
      resolveSecond(
        new Response(
          JSON.stringify({
            data: [{ key: 'clients', label: 'Clients', hits: [{ id: 'b', label: 'Bravo Result', meta: '', href: '/clients/b', icon: 'building' }] }],
          }),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await waitFor(() => expect(screen.getByRole('option', { name: /bravo result/i })).toBeTruthy());

    // Now resolve the FIRST (earlier, slower) request late. If the abort
    // guard were missing, this stale response would overwrite state and
    // "Alpha Result" would replace "Bravo Result".
    await act(async () => {
      resolveFirst(
        new Response(
          JSON.stringify({
            data: [{ key: 'clients', label: 'Clients', hits: [{ id: 'a', label: 'Alpha Result', meta: '', href: '/clients/a', icon: 'building' }] }],
          }),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(screen.getByRole('option', { name: /bravo result/i })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /alpha result/i })).toBeFalsy();
  });
});
