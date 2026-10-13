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
  url: { search: '' },
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
}));

import { TicketQueue } from '@/components/tickets/TicketQueue';
import type { TicketsResult } from '@/lib/server/tickets';

const RESULT = {
  tickets: [],
  counts: { open: 0, waiting: 0, resolved: 0 },
  truncated: false,
} as unknown as TicketsResult;

afterEach(() => {
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
