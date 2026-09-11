// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let currentSearch = '';
const replaceStateSpy = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

function mockFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/admin/support/sessions')) {
      return { ok: true, json: async () => ({ sessions: [] }) } as Response;
    }
    if (url.includes('/api/admin/communities/')) {
      return { ok: true, json: async () => ({ members: [] }) } as Response;
    }
    if (url.includes('/api/admin/support/access-log')) {
      return { ok: true, json: async () => ({ entries: [] }) } as Response;
    }
    throw new Error(`Unhandled fetch in test: ${url}`);
  });
}

async function renderTab(): Promise<{ container: HTMLDivElement; root: ReturnType<typeof createRoot> }> {
  const { SupportAccessTab } = await import('@/components/clients/SupportAccessTab');
  const container = document.createElement('div');
  const root = createRoot(container);

  await act(async () => {
    root.render(<SupportAccessTab communityId={42} communitySlug="sunset-condos" />);
  });
  // Flush the fetch-driven state updates.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return { container, root };
}

describe('SupportAccessTab ?start=1 auto-open', () => {
  beforeEach(() => {
    currentSearch = '';
    vi.spyOn(window.history, 'replaceState').mockImplementation(replaceStateSpy);
    replaceStateSpy.mockClear();
    mockFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the Start Session dialog on mount when the URL carries ?start=1', async () => {
    currentSearch = 'tab=support&start=1';
    const { container, root } = await renderTab();

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('strips the start flag from the address bar so re-opening the tab cannot reopen the dialog', async () => {
    currentSearch = 'tab=support&start=1';
    const { root } = await renderTab();

    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    const [, , url] = replaceStateSpy.mock.calls[0] as [unknown, unknown, string];
    expect(url).not.toContain('start=1');
    expect(url).toContain('tab=support');

    await act(async () => {
      root.unmount();
    });
  });

  it('does not open the dialog, and does not touch history, when ?start= is absent', async () => {
    currentSearch = 'tab=support';
    const { container, root } = await renderTab();

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(replaceStateSpy).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});

/**
 * Three privileged mutations used to be `if (res.ok) { … }` with no else.
 * The End-Session one is the dangerous half: the spinner closed and the banner
 * stayed put while the impersonation session was still LIVE, so the operator
 * believed it had ended.
 */
describe('SupportAccessTab failure surfacing', () => {
  const ACTIVE_SESSION = {
    id: 7,
    admin_user_id: 'admin-0000-1111',
    reason: 'Ticket 412 — cannot see documents',
    ticket_id: 'T-412',
    started_at: '2026-09-10T12:00:00.000Z',
    ended_at: null,
  };

  function mockFetchWith(opts: {
    sessions?: unknown[];
    membersOk?: boolean;
    patchOk?: boolean;
    patchBody?: unknown;
  }) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? 'GET') === 'PATCH') {
        return {
          ok: opts.patchOk ?? true,
          json: async () => opts.patchBody ?? {},
        } as Response;
      }
      if (url.includes('/api/admin/support/sessions')) {
        return { ok: true, json: async () => ({ sessions: opts.sessions ?? [] }) } as Response;
      }
      if (url.includes('/api/admin/communities/')) {
        return {
          ok: opts.membersOk ?? true,
          json: async () => (opts.membersOk === false ? {} : { members: [] }),
        } as Response;
      }
      throw new Error(`Unhandled fetch in test: ${url}`);
    });
  }

  beforeEach(() => {
    currentSearch = 'tab=support';
    vi.spyOn(window.history, 'replaceState').mockImplementation(replaceStateSpy);
    replaceStateSpy.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function endTheSession(container: HTMLElement) {
    const endButton = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('End Session'),
    ) as HTMLButtonElement;
    expect(endButton, 'the active session row did not render').not.toBeNull();
    await act(async () => endButton.click());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('says the session is STILL ACTIVE when End Session fails', async () => {
    mockFetchWith({ sessions: [ACTIVE_SESSION], patchOk: false, patchBody: {} });
    const { container, root } = await renderTab();

    await endTheSession(container);

    const alerts = [...container.querySelectorAll('[role="alert"]')].map((n) => n.textContent ?? '');
    expect(alerts.some((text) => text.includes('still active'))).toBe(true);
    // The session itself must stay on screen — it did not end.
    expect(container.textContent).toContain('Ticket 412');

    await act(async () => root.unmount());
  });

  it('prefers the server\'s own message when the refusal carries one', async () => {
    mockFetchWith({ sessions: [ACTIVE_SESSION], patchOk: false, patchBody: { error: 'Session already closed' } });
    const { container, root } = await renderTab();

    await endTheSession(container);

    expect(container.textContent).toContain('Session already closed');

    await act(async () => root.unmount());
  });

  it('shows no alert when End Session succeeds', async () => {
    mockFetchWith({ sessions: [ACTIVE_SESSION], patchOk: true });
    const { container, root } = await renderTab();

    await endTheSession(container);

    const alerts = [...container.querySelectorAll('[role="alert"]')].map((n) => n.textContent ?? '');
    expect(alerts.some((text) => text.includes('still active'))).toBe(false);

    await act(async () => root.unmount());
  });

  it('explains an empty Start-Session picker when the members fetch fails', async () => {
    mockFetchWith({ membersOk: false });
    const { container, root } = await renderTab();

    const alerts = [...container.querySelectorAll('[role="alert"]')].map((n) => n.textContent ?? '');
    expect(alerts.some((text) => text.includes('Start Session picker is empty'))).toBe(true);
    // Only `sessionsRes.ok` was checked before, so the tab rendered as if the
    // community simply had no members.
    expect(container.textContent).not.toContain("Couldn't load support sessions");

    await act(async () => root.unmount());
  });

  it('shows no notice when both loads succeed', async () => {
    mockFetchWith({});
    const { container, root } = await renderTab();

    expect(container.textContent).not.toContain('Start Session picker is empty');

    await act(async () => root.unmount());
  });
});
