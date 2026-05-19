import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBootstrapOnboardingChecklist } from '../use-onboarding-checklist';

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

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useBootstrapOnboardingChecklist', () => {
  it('POSTs the exact URL and body and resolves void', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 201 }));
    const { result } = renderHook(() => useBootstrapOnboardingChecklist(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(42);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/onboarding/checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ communityId: 42 }),
    });
  });

  it('reports an error state when the POST responds non-OK', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const { result } = renderHook(() => useBootstrapOnboardingChecklist(), {
      wrapper: createWrapper(),
    });
    result.current.mutate(7);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(
      new Error('Failed to bootstrap onboarding checklist'),
    );
  });

  it('reports an error state when fetch itself throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useBootstrapOnboardingChecklist(), {
      wrapper: createWrapper(),
    });
    result.current.mutate(7);
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
