/**
 * `useDecideArcSubmission` must put `ruleReference` on the wire.
 *
 * The decide contract (`app/api/v1/arc/[id]/decide/contract.ts`) rejects a
 * denial whose `ruleReference` is missing or blank — HB 1203 / §720.3035
 * requires a denial to cite the specific rule or covenant. The hook used to
 * drop the field, so every denial sent from the UI was a 400.
 *
 * Deliberately NOT `use-arc.test.tsx`: that path belongs to an open PR (#1216).
 */
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useDecideArcSubmission } from '../use-arc';

const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function sentBody(): Record<string, unknown> {
  expect(mockFetch).toHaveBeenCalledTimes(1);
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('/api/v1/arc/7/decide');
  expect(init.method).toBe('POST');
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('useDecideArcSubmission', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation(async () =>
      new Response(JSON.stringify({ data: { id: 7 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('sends ruleReference in the body of a denial', async () => {
    const { result } = renderHook(() => useDecideArcSubmission(42), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: 7,
        decision: 'denied',
        reviewNotes: 'Unfinished hardwood on a street elevation.',
        ruleReference: 'Declaration Art. VII §3',
      });
    });

    expect(sentBody()).toEqual({
      communityId: 42,
      decision: 'denied',
      reviewNotes: 'Unfinished hardwood on a street elevation.',
      ruleReference: 'Declaration Art. VII §3',
    });
  });

  it('leaves ruleReference off an approval that does not supply one', async () => {
    const { result } = renderHook(() => useDecideArcSubmission(42), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: 7, decision: 'approved', reviewNotes: null });
    });

    expect(sentBody()).toEqual({ communityId: 42, decision: 'approved', reviewNotes: null });
  });
});
