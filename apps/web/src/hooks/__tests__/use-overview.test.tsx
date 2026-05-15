import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERVIEW_QUERY_KEY, useOverview } from '../use-overview';
import type { OverviewPayload } from '@/lib/queries/cross-community.types';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useOverview', () => {
  it('loads the standard overview response envelope', async () => {
    const payload: OverviewPayload = {
      cards: [
        {
          communityId: 1,
          communityName: 'Sunset Condos',
          communitySlug: 'sunset-condos',
          communityType: 'condo_718',
          complianceScore: 92,
          urgentItemCount: 2,
          criticalItemCount: 1,
        },
      ],
      activity: [
        {
          id: 'document-1',
          communityId: 1,
          communityName: 'Sunset Condos',
          communitySlug: 'sunset-condos',
          type: 'document',
          title: 'Budget uploaded',
          occurredAt: '2026-05-15T12:00:00.000Z',
          link: '/documents/1',
        },
      ],
      events: [
        {
          id: 'meeting-1',
          communityId: 1,
          communityName: 'Sunset Condos',
          communitySlug: 'sunset-condos',
          type: 'meeting',
          title: 'Board meeting',
          scheduledFor: '2026-05-20T18:00:00.000Z',
          link: '/meetings/1',
        },
      ],
    };

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: payload }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useOverview(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/overview',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.dataUpdatedAt).toBeGreaterThan(0);
  });

  it('uses the stable overview query key', () => {
    expect(OVERVIEW_QUERY_KEY).toEqual(['overview']);
  });

  it('surfaces request failures to the client error state', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Not signed in' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useOverview(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('Not signed in'));
  });
});
