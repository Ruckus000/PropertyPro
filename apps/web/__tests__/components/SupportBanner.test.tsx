/**
 * The support banner is the only escape hatch from an impersonated session on
 * the tenant side, so its two behaviours are load-bearing:
 *
 * 1. It renders from a server-resolved prop, not a `document.cookie` sniff —
 *    the cookie is HttpOnly now and invisible to JavaScript.
 * 2. "End Session" hits the server route. The old handler only cleared the
 *    browser cookie, which left the `support_sessions` row open.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { SupportBanner } from '@/components/support/SupportBanner';

/**
 * Ending a session goes through a TanStack mutation hook, so the banner needs a
 * QueryClientProvider — which is why the authenticated layout renders it INSIDE
 * `AppQueryProvider`. A React Query hook outside its provider throws at render.
 */
function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

/** Shape `requestJson` expects: ok + a `{ data }` JSON envelope. */
function okResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data }),
    text: async () => JSON.stringify({ data }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ ended: true })));
});

describe('SupportBanner', () => {
  it('renders nothing when no support session is active', () => {
    const { container } = render(wrap(<SupportBanner active={false} />));
    expect(container).toBeEmptyDOMElement();
  });

  it('warns the operator when a session is active', () => {
    render(wrap(<SupportBanner active />));
    expect(screen.getByText('Support Mode — Read-Only')).toBeTruthy();
  });

  it('ends the session through the server route, not by clearing a cookie', async () => {
    render(wrap(<SupportBanner active />));

    fireEvent.click(screen.getByRole('button', { name: /end session/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    // requestJson adds headers/credentials, so assert the URL and method only.
    const [url, init] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(url).toBe('/api/v1/support/end-session');
    expect((init as { method?: string }).method).toBe('POST');
    // refresh() is what re-runs the server components against a request that no
    // longer carries the cookie; without it the impersonated shell persists.
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  // If the request failed the session is still live. Hiding the banner would
  // tell the operator they had left impersonation when they had not — and take
  // away the only control that ends it.
  it('keeps the banner when ending the session fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    render(wrap(<SupportBanner active />));
    fireEvent.click(screen.getByRole('button', { name: /end session/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByText('Support Mode — Read-Only')).toBeTruthy();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
