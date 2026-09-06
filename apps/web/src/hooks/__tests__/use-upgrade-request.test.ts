import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUpgradeRequest } from '../use-upgrade-request';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useUpgradeRequest', () => {
  it('POSTs to the URL WITH communityId query param and returns { ok, notified }', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { ok: true, notified: 3 } }));
    const { result } = renderHook(() => useUpgradeRequest(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({
      communityId: 42,
      featureKey: 'hasViolations',
      requestedPlan: 'pro',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ ok: true, notified: 3 });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/billing/upgrade-requests?communityId=42',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          featureKey: 'hasViolations',
          requestedPlan: 'pro',
        }),
      },
    );
  });

  it('POSTs to the URL WITHOUT a query param when communityId is null', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { ok: true, notified: 0 } }));
    const { result } = renderHook(() => useUpgradeRequest(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({
      communityId: null,
      featureKey: null,
      requestedPlan: null,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ ok: true, notified: 0 });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/billing/upgrade-requests');
    expect(url).not.toContain('?');
  });

  it('omits the query param when communityId is 0 (falsy), matching original truthiness', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { ok: true, notified: 1 } }));
    const { result } = renderHook(() => useUpgradeRequest(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({
      communityId: 0,
      featureKey: 'hasViolations',
      requestedPlan: 'plus',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/billing/upgrade-requests');
  });

  it('throws the route message on a non-OK { message } body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { message: 'Tenants cannot request plan upgrades.' }),
    );
    const { result } = renderHook(() => useUpgradeRequest(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({
      communityId: 1,
      featureKey: 'hasViolations',
      requestedPlan: 'pro',
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(
      new Error('Tenants cannot request plan upgrades.'),
    );
  });

  it('falls back to the exact curly-apostrophe literal on a non-JSON error body (documented exception path)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>500</html>', {
        status: 500,
        headers: { 'content-type': 'text/html' },
      }),
    );
    const { result } = renderHook(() => useUpgradeRequest(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({
      communityId: 1,
      featureKey: 'hasViolations',
      requestedPlan: 'pro',
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    // Curly apostrophe (U+2019) — must match the component's literal byte-for-byte.
    expect(result.current.error).toEqual(
      new Error('We couldn’t send your request. Please try again.'),
    );
  });

  it('falls back to the exact literal when error JSON has no message field', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { somethingElse: true }));
    const { result } = renderHook(() => useUpgradeRequest(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({
      communityId: 1,
      featureKey: 'hasViolations',
      requestedPlan: 'pro',
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(
      new Error('We couldn’t send your request. Please try again.'),
    );
  });
});
