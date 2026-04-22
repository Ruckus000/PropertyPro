import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreateUnit } from '../../src/hooks/use-units';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useCreateUnit — server error surfacing', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('surfaces AppError.toJSON().error.message on failure (not [object Object])', async () => {
    // withErrorHandler wraps AppError.toJSON() → { error: { code, message, details? } }
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'VALIDATION_ERROR', message: 'Unit number "101" already exists in this community' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useCreateUnit(42), { wrapper: createWrapper() });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ communityId: 42, unitNumber: '101' }),
      ).rejects.toThrow('Unit number "101" already exists in this community');
    });

    await waitFor(() => {
      expect(result.current.error?.message).toBe(
        'Unit number "101" already exists in this community',
      );
    });
    expect(result.current.error?.message).not.toContain('[object Object]');
  });

  it('falls back to status-based message when body is not JSON', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('not json', { status: 500 }),
    );

    const { result } = renderHook(() => useCreateUnit(42), { wrapper: createWrapper() });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ communityId: 42, unitNumber: '101' }),
      ).rejects.toThrow(/Failed to create unit: 500/);
    });
  });
});
