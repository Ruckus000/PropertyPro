// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// cmdk's Command.List measures itself with a ResizeObserver and scrolls the
// selected item into view; jsdom implements neither. Same shims the Task 10
// palette test uses.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

const back = vi.fn();
const pathname = { current: '/dashboard' };

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: any) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn(), back, replace: vi.fn(), prefetch: vi.fn() }),
}));

import { AdminShell } from '@/components/shell/AdminShell';
import type { ShellSignals } from '@/lib/server/shell-signals';

const user = { email: 'ops@getpropertypro.com', initial: 'O' };

const signals: ShellSignals = {
  counts: { inbox: 0, tickets: 0, health: 0, onboarding: 0, billing: 0, leads: 0, deletion: 0 },
  items: [],
  critical: null,
  generatedAt: '2026-09-09T10:00:00.000Z',
  failed: [],
};

/**
 * jsdom has no `matchMedia`. Installs one that answers per QUERY, because the
 * shell and the rail ask different questions of it: the shell asks
 * `(max-width: 899px)` to decide rail-vs-drawer, and `AdminRail` asks
 * `(hover: none)` to decide whether hover-expand is even possible.
 */
function installMatchMedia(matches: (query: string) => boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const DESKTOP = () => false;
const TOUCH_PHONE = (query: string) =>
  query === '(max-width: 899px)' || query === '(hover: none)';

beforeEach(() => {
  pathname.current = '/dashboard';
  back.mockClear();
  localStorage.clear();
  installMatchMedia(DESKTOP);
  global.fetch = vi.fn(
    async () => new Response(JSON.stringify({ data: signals })),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AdminShell', () => {
  it('renders the rail, the single main landmark, and opens the palette on ⌘K', () => {
    render(
      <AdminShell user={user} initialSignals={signals} initialReadAt={null}>
        <p>content</p>
      </AdminShell>,
    );

    expect(document.querySelectorAll('main#main-content')).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
    expect(screen.getByText('content')).toBeTruthy();

    act(() => {
      fireEvent.keyDown(window, { key: 'k', metaKey: true });
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('skips the centred padded wrapper on full-bleed demo routes', () => {
    for (const route of ['/demo/new', '/demo/42/preview', '/demo/42/mobile']) {
      pathname.current = route;
      const { container, unmount } = render(
        <AdminShell user={user} initialSignals={signals} initialReadAt={null}>
          <p>content</p>
        </AdminShell>,
      );
      const main = container.querySelector('main#main-content')!;
      // `children` renders directly inside <main> on these routes: the <p> is
      // main's own first element child, not wrapped in the padded div.
      expect(main.firstElementChild?.tagName, route).toBe('P');
      expect(main.querySelector('.max-w-7xl'), route).toBeNull();
      unmount();
    }
  });

  it('keeps the centred padded wrapper on an ordinary route', () => {
    pathname.current = '/dashboard';
    const { container } = render(
      <AdminShell user={user} initialSignals={signals} initialReadAt={null}>
        <p>content</p>
      </AdminShell>,
    );
    const main = container.querySelector('main#main-content')!;
    expect(main.firstElementChild?.className).toContain('max-w-7xl');
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('keeps exactly one main landmark once the drawer and the palette are both open', () => {
    installMatchMedia(TOUCH_PHONE);
    render(
      <AdminShell user={user} initialSignals={signals} initialReadAt={null}>
        <p>content</p>
      </AdminShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    act(() => {
      fireEvent.keyDown(window, { key: 'k', metaKey: true });
    });

    expect(document.querySelectorAll('main#main-content')).toHaveLength(1);
    expect(document.querySelectorAll('#main-content')).toHaveLength(1);
  });

  it('swaps the rail for the drawer at narrow widths, and Escape closes it', async () => {
    installMatchMedia(TOUCH_PHONE);
    render(
      <AdminShell user={user} initialSignals={signals} initialReadAt={null}>
        <p>content</p>
      </AdminShell>,
    );

    // No persistent rail on a narrow viewport — the nav lives in the drawer.
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    await waitFor(() =>
      expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull(),
    );
  });

  it('offers Back only on a narrow viewport and only on a detail route', () => {
    pathname.current = '/clients/42';
    installMatchMedia(TOUCH_PHONE);
    const { unmount } = render(
      <AdminShell user={user} initialSignals={signals} initialReadAt={null}>
        <p>content</p>
      </AdminShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(back).toHaveBeenCalled();
    unmount();

    pathname.current = '/clients';
    render(
      <AdminShell user={user} initialSignals={signals} initialReadAt={null}>
        <p>content</p>
      </AdminShell>,
    );
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('restores the pinned rail preference after mount and persists a toggle', () => {
    localStorage.setItem('ppro-admin-nav-pinned', 'true');
    const { container } = render(
      <AdminShell user={user} initialSignals={signals} initialReadAt={null}>
        <p>content</p>
      </AdminShell>,
    );

    const nav = container.querySelector('nav[aria-label="Main navigation"]')!;
    expect(nav.className).toContain('w-[260px]');

    fireEvent.click(screen.getByRole('button', { name: /collapse navigation/i }));
    expect(localStorage.getItem('ppro-admin-nav-pinned')).toBe('false');
  });

  it('renders the critical banner between the top bar and the main content', () => {
    render(
      <AdminShell
        user={user}
        initialSignals={{
          ...signals,
          critical: {
            fingerprint: 'f1',
            text: 'Stripe webhook backlog is 412 events deep',
            shortText: 'Webhook backlog',
            href: '/health',
          },
        }}
        initialReadAt={null}
      >
        <p>content</p>
      </AdminShell>,
    );

    const banner = screen.getByRole('alert');
    const header = document.querySelector('header')!;
    const main = document.querySelector('main#main-content')!;
    // Document order: header -> banner -> main.
    expect(header.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(banner.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('polls the signals endpoint while visible and skips the poll while hidden', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ data: { ...signals, counts: { ...signals.counts, inbox: 4 } } }),
        ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AdminShell user={user} initialSignals={signals} initialReadAt={null}>
        <p>content</p>
      </AdminShell>,
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/shell/signals', { cache: 'no-store' });
    expect(screen.getByRole('link', { name: 'Inbox' }).textContent).toContain('4');

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });

  it('re-polls immediately on visibilitychange, catching up a tick lost while hidden', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ data: { ...signals, counts: { ...signals.counts, inbox: 7 } } }),
        ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AdminShell user={user} initialSignals={signals} initialReadAt={null}>
        <p>content</p>
      </AdminShell>,
    );

    // Tab goes hidden; the interval tick that falls due is lost (matches the
    // existing "skips the poll while hidden" test above).
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    // Tab becomes visible again, well before the next interval tick is due.
    visibility.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Inbox' }).textContent).toContain('7');
    visibility.mockRestore();
  });

  it('does not start a second poll while one is still in flight', async () => {
    vi.useFakeTimers();
    let resolveFetch: (() => void) | null = null;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = () => resolve(new Response(JSON.stringify({ data: signals })));
        }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AdminShell user={user} initialSignals={signals} initialReadAt={null}>
        <p>content</p>
      </AdminShell>,
    );

    // The interval tick starts a fetch that does not resolve yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A visibilitychange fires while that request is still in flight — it
    // must not start an overlapping second one.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Once the in-flight request settles, a fresh visibilitychange is free
    // to start another.
    await act(async () => {
      resolveFetch?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the last good signals when the poll fails', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    render(
      <AdminShell
        user={user}
        initialSignals={{ ...signals, counts: { ...signals.counts, inbox: 9 } }}
        initialReadAt={null}
      >
        <p>content</p>
      </AdminShell>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.getByRole('link', { name: 'Inbox' }).textContent).toContain('9');
  });

  it('marks every tray item read from the shell', () => {
    render(
      <AdminShell
        user={user}
        initialSignals={{
          ...signals,
          items: [
            {
              key: 'inbox' as const,
      id: 'a',
              tone: 'info',
              icon: 'inbox',
              title: 'New reply from Denise',
              meta: 'support@',
              href: '/inbox/1',
              occurredAt: '2026-09-08T09:14:00.000Z',
            },
          ],
        }}
        initialReadAt={null}
      >
        <p>content</p>
      </AdminShell>,
    );

    expect(screen.getByRole('button', { name: /notifications, 1 unread/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /notifications, 1 unread/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(screen.getByRole('button', { name: /notifications, 0 unread/i })).toBeTruthy();
  });

  // Finding 6 (review): `handleMarkAllRead` used to stamp `readAt` from
  // `new Date().toISOString()` — the OPERATOR'S BROWSER clock — instead of
  // `signals.generatedAt`, the server's. This test simulates the browser
  // clock running 10 minutes BEHIND the server: the system clock is pinned
  // to 09:50, `generatedAt` (and thus the item below) sits at 09:55-10:00.
  // Under the browser-clock bug, "Mark all read" would stamp `readAt` at
  // 09:50 — before the item's `occurredAt` of 09:55 — so it stays unread
  // even right after the click. The two clocks being different machines is
  // exactly what `admin-shell.test.tsx`'s other tests never exercise (jsdom
  // gives them the same clock for both), which is why this one exists.
  it('marks all read using the SERVER clock even when the browser clock is skewed behind it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T09:50:00.000Z'));

    render(
      <AdminShell
        user={user}
        initialSignals={{
          ...signals,
          generatedAt: '2026-09-09T10:00:00.000Z',
          items: [
            {
              key: 'inbox' as const,
      id: 'a',
              tone: 'info',
              icon: 'inbox',
              title: 'New reply from Denise',
              meta: 'support@',
              href: '/inbox/1',
              occurredAt: '2026-09-09T09:55:00.000Z',
            },
          ],
        }}
        initialReadAt={null}
      >
        <p>content</p>
      </AdminShell>,
    );

    expect(screen.getByRole('button', { name: /notifications, 1 unread/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /notifications, 1 unread/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(screen.getByRole('button', { name: /notifications, 0 unread/i })).toBeTruthy();
  });
});

/**
 * Wave 4: the tray's read watermark is persisted per operator, and the click
 * that moves it is OPTIMISTIC.
 *
 * The property that matters is the pair: the badge must drop the instant the
 * button is pressed (a tray that waits on a round trip reads as broken), and it
 * must come BACK if the write did not land (a `Mark all read` that silently
 * failed is worse than one that visibly did nothing — nothing later
 * contradicts it).
 */
describe('AdminShell — persisted tray watermark', () => {
  /** One item, five minutes older than the signal payload that carries it. */
  const withItem: ShellSignals = {
    ...signals,
    generatedAt: '2026-09-09T10:00:00.000Z',
    items: [
      {
        key: 'inbox' as const,
        id: 'a',
        tone: 'info' as const,
        icon: 'inbox' as const,
        title: 'New reply from Denise',
        meta: 'support@',
        href: '/inbox/1',
        occurredAt: '2026-09-09T09:55:00.000Z',
      },
    ],
  };

  function readAllResponse(notificationsReadAt: string | null) {
    return new Response(JSON.stringify({ data: { notificationsReadAt } }), { status: 200 });
  }

  it('honours a watermark stored by a previous session, with no click at all', () => {
    render(
      <AdminShell user={user} initialSignals={withItem} initialReadAt="2026-09-09T09:56:00.000Z">
        <p>content</p>
      </AdminShell>,
    );

    // Before wave 4 this seeded to `null` and every item read as unread on
    // every page load, forever.
    expect(screen.getByRole('button', { name: /notifications, 0 unread/i })).toBeTruthy();
  });

  it('drops the badge before the POST settles, then persists it', async () => {
    let release: (r: Response) => void = () => {};
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      String(url).includes('/preferences/read-all')
        ? new Promise<Response>((resolve) => {
            release = resolve;
          })
        : Promise.resolve(new Response(JSON.stringify({ data: withItem }))),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AdminShell user={user} initialSignals={withItem} initialReadAt={null}>
        <p>content</p>
      </AdminShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: /notifications, 1 unread/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));

    // The request has NOT resolved. The badge is already clear.
    expect(screen.getByRole('button', { name: /notifications, 0 unread/i })).toBeTruthy();

    const call = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes('/preferences/read-all'),
    )!;
    expect(call[0]).toBe('/api/admin/preferences/read-all');
    expect(call[1]?.method).toBe('POST');

    await act(async () => {
      release(readAllResponse('2026-09-09T10:00:05.000Z'));
    });
    expect(screen.getByRole('button', { name: /notifications, 0 unread/i })).toBeTruthy();
  });

  it('adopts the SERVER\'s stamp rather than keeping its own optimistic guess', async () => {
    // A deliberately implausible response — a watermark OLDER than the item —
    // because it is the only value that tells the two apart. Keeping the
    // optimistic `generatedAt` leaves the badge at 0; adopting what was
    // actually stored puts it back to 1, which is what a reload would show.
    global.fetch = vi.fn((url: string) =>
      String(url).includes('/preferences/read-all')
        ? Promise.resolve(readAllResponse('2026-09-09T09:00:00.000Z'))
        : Promise.resolve(new Response(JSON.stringify({ data: withItem }))),
    ) as unknown as typeof fetch;

    render(
      <AdminShell user={user} initialSignals={withItem} initialReadAt={null}>
        <p>content</p>
      </AdminShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: /notifications, 1 unread/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /notifications, 1 unread/i })).toBeTruthy(),
    );
  });

  it('restores the previous watermark when the write fails', async () => {
    global.fetch = vi.fn((url: string) =>
      String(url).includes('/preferences/read-all')
        ? Promise.resolve(new Response('{}', { status: 500 }))
        : Promise.resolve(new Response(JSON.stringify({ data: withItem }))),
    ) as unknown as typeof fetch;

    render(
      <AdminShell user={user} initialSignals={withItem} initialReadAt={null}>
        <p>content</p>
      </AdminShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: /notifications, 1 unread/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /notifications, 1 unread/i })).toBeTruthy(),
    );
  });

  it('restores it when the request is dropped entirely', async () => {
    global.fetch = vi.fn((url: string) => {
      if (String(url).includes('/preferences/read-all')) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve(new Response(JSON.stringify({ data: withItem })));
    }) as unknown as typeof fetch;

    render(
      <AdminShell user={user} initialSignals={withItem} initialReadAt={null}>
        <p>content</p>
      </AdminShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: /notifications, 1 unread/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /notifications, 1 unread/i })).toBeTruthy(),
    );
  });
});
