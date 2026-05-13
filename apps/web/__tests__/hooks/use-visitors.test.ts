import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { walkPaginatedMock } = vi.hoisted(() => ({
  walkPaginatedMock: vi.fn(),
}));

vi.mock('@/lib/api/walk-paginated', () => ({
  walkPaginated: walkPaginatedMock,
}));

import { useVisitors } from '../../src/hooks/use-visitors';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useVisitors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walkPaginatedMock.mockResolvedValue([
      { id: 1, visitorName: 'Guest', purpose: 'Visit' },
    ]);
  });

  it('walks canonical visitor pages while preserving the array return shape', async () => {
    const { result } = renderHook(
      () => useVisitors(42, {
        hostUnitId: 10,
        active: true,
        guestType: 'vendor',
        status: 'checked_in',
      }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(walkPaginatedMock).toHaveBeenCalledWith(
      '/api/v1/visitors',
      {
        communityId: '42',
        hostUnitId: '10',
        active: 'true',
        guestType: 'vendor',
        status: 'checked_in',
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(result.current.data).toEqual([
      { id: 1, visitorName: 'Guest', purpose: 'Visit' },
    ]);
  });
});
