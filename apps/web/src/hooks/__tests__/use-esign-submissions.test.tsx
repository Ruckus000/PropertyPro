import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import {
  useCancelEsignSubmission,
  useSendEsignReminder,
} from '../use-esign-submissions';

const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return {
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCancelEsignSubmission', () => {
  it('succeeds when the route returns a nested data payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { success: true } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCancelEsignSubmission(42), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(12);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/esign/submissions/12/cancel',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ communityId: 42 }),
      }),
    );
  });

  it('fails fast when the route omits the data payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCancelEsignSubmission(42), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync(12);
      }),
    ).rejects.toThrow('Missing response payload');
  });
});

describe('useSendEsignReminder', () => {
  it('succeeds when the route returns a nested data payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { success: true } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSendEsignReminder(42), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ submissionId: 12, signerId: 7 });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/esign/submissions/12/remind',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ communityId: 42, signerId: 7 }),
      }),
    );
  });

  it('fails fast when the route omits the data payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSendEsignReminder(42), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ submissionId: 12, signerId: 7 });
      }),
    ).rejects.toThrow('Missing response payload');
  });
});
