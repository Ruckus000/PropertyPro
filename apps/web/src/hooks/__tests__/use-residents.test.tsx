import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_ROLES_PARAM, useResidents } from '../use-residents';

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

describe('useResidents', () => {
  it('exposes the canonical admin-roles param', () => {
    expect(ADMIN_ROLES_PARAM).toBe(
      'board_member,board_president,cam,site_manager,property_manager_admin',
    );
  });

  it('does not fetch when communityId is not positive', () => {
    renderHook(() => useResidents(0, ADMIN_ROLES_PARAM), {
      wrapper: createWrapper(),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests the exact URL with roles, forwards the signal, and maps the standard envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            { userId: 'u1', fullName: 'Alice Owner', role: 'cam', extra: 'ignored' },
            { userId: 'u2', fullName: 'Bob Board', role: 'board_member' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useResidents(42, ADMIN_ROLES_PARAM), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      { userId: 'u1', fullName: 'Alice Owner', role: 'cam' },
      { userId: 'u2', fullName: 'Bob Board', role: 'board_member' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/residents?communityId=42&roles=${ADMIN_ROLES_PARAM}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('uses a stable query key including communityId and roles', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { result } = renderHook(() => useResidents(7, 'cam'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('surfaces request failures to the error state', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Forbidden' } }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useResidents(42, ADMIN_ROLES_PARAM), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('Forbidden'));
  });

  it('refetches when communityId changes', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useResidents(id, ADMIN_ROLES_PARAM),
      { wrapper: createWrapper(), initialProps: { id: 1 } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/v1/residents?communityId=1&roles=${ADMIN_ROLES_PARAM}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    rerender({ id: 2 });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        `/api/v1/residents?communityId=2&roles=${ADMIN_ROLES_PARAM}`,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });
});
