import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeQueryClient } from '@/components/providers/query-provider';
import { useNotifications } from '@/hooks/use-notifications';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function notificationsResponse(title: string) {
  return new Response(
    JSON.stringify({
      data: {
        data: [{ id: 1, title }],
        pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('makeQueryClient defaults', () => {
  it('keeps navigation-friendly cache defaults', () => {
    const client = makeQueryClient();
    const defaults = client.getDefaultOptions().queries;

    expect(defaults?.staleTime).toBe(60 * 1000);
    expect(defaults?.gcTime).toBe(10 * 60 * 1000);
    expect(defaults?.refetchOnWindowFocus).toBe(false);
  });
});

describe('list hooks keep previous data across filter changes', () => {
  it('retains the previous page while a filter change refetches', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    fetchMock.mockResolvedValueOnce(notificationsResponse('first page'));

    const { result, rerender } = renderHook(
      ({ category }: { category?: string }) =>
        useNotifications(1, category ? { category } : {}),
      { wrapper, initialProps: { category: undefined as string | undefined } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data[0]?.title).toBe('first page');

    // Second fetch stays pending; the hook must keep showing the old data.
    let resolveSecond: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveSecond = resolve;
      }),
    );

    rerender({ category: 'billing' });

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(true));
    expect(result.current.data?.data[0]?.title).toBe('first page');

    resolveSecond(notificationsResponse('billing page'));
    await waitFor(() =>
      expect(result.current.data?.data[0]?.title).toBe('billing page'),
    );
    expect(result.current.isPlaceholderData).toBe(false);
  });
});
