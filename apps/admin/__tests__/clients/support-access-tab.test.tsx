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
