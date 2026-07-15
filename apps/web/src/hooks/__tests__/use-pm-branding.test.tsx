import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCopyBranding } from '../use-pm-branding';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
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

describe('useCopyBranding', () => {
  it('PATCHes each target community with the mapped patch and aggregates success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: {} }));

    const { result } = renderHook(() => useCopyBranding(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      sourceBranding: {
        primaryColor: '#fff', // design-tokens:exempt — branding hex round-trip test fixture
        logoPath: 'logos/a.webp',
        fontHeading: undefined,
      },
      properties: ['primaryColor', 'logoPath', 'fontHeading'],
      communityIds: [11, 22],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ succeeded: 2, total: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map((c) =>
      JSON.parse(String((c[1] as RequestInit).body)),
    );
    // logoPath maps to logoStoragePath; undefined fontHeading omitted.
    expect(bodies).toEqual([
      { communityId: 11, primaryColor: '#fff', logoStoragePath: 'logos/a.webp' }, // design-tokens:exempt — branding hex round-trip test fixture
      { communityId: 22, primaryColor: '#fff', logoStoragePath: 'logos/a.webp' }, // design-tokens:exempt — branding hex round-trip test fixture
    ]);
    for (const c of fetchMock.mock.calls) {
      expect(c[0]).toBe('/api/v1/pm/branding');
      expect((c[1] as RequestInit).method).toBe('PATCH');
    }
  });

  it('counts only fulfilled communities when one PATCH fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { data: {} }))
      .mockResolvedValueOnce(jsonResponse(500, { error: { message: 'boom' } }));

    const { result } = renderHook(() => useCopyBranding(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      sourceBranding: { primaryColor: '#abc' }, // design-tokens:exempt — branding hex round-trip test fixture
      properties: ['primaryColor'],
      communityIds: [1, 2],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ succeeded: 1, total: 2 });
  });
});
