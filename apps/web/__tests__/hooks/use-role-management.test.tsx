import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

const { requestJsonMock } = vi.hoisted(() => ({
  requestJsonMock: vi.fn(),
}));

vi.mock('@/lib/api/request-json', () => ({
  requestJson: requestJsonMock,
}));

import {
  useCommunityRoster,
  useAssignPropertyManager,
  useRevokePropertyManager,
  useTransferRoot,
  useSetDesignation,
  COMMUNITY_ROSTER_KEY,
} from '@/hooks/use-role-management';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { Wrapper, client };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCommunityRoster', () => {
  it('GETs /api/v1/residents (no roles param) and maps rows', async () => {
    requestJsonMock.mockResolvedValueOnce([
      { userId: 'u1', fullName: 'Root Rita', role: 'root_manager', extra: 'ignored' },
      { userId: 'u2', fullName: 'PM Pat', role: 'property_manager' },
    ]);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCommunityRoster(42), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { userId: 'u1', fullName: 'Root Rita', role: 'root_manager' },
      { userId: 'u2', fullName: 'PM Pat', role: 'property_manager' },
    ]);
    expect(requestJsonMock).toHaveBeenCalledWith(
      '/api/v1/residents?communityId=42',
      expect.anything(),
    );
  });

  it('does not fetch when communityId is 0', async () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useCommunityRoster(0), { wrapper: Wrapper });
    await new Promise((r) => setTimeout(r, 10));
    expect(requestJsonMock).not.toHaveBeenCalled();
  });
});

describe('useAssignPropertyManager', () => {
  // Uses a RAW fetch (not requestJson) so the structured error code survives.
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('POSTs the right body and returns the unwrapped payload', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { assigned: true, alreadyAssigned: false } }),
    });
    const { Wrapper, client } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useAssignPropertyManager(42), {
      wrapper: Wrapper,
    });
    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync({ userId: 'u9' });
    });
    expect(returned).toEqual({ assigned: true, alreadyAssigned: false });
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]!;
    expect(url).toBe('/api/v1/communities/role-assignments');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ communityId: 42, userId: 'u9' });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: COMMUNITY_ROSTER_KEY(42),
    });
  });

  it('throws a typed error carrying the code + maxAdmins on an admin-cap 403', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: {
          code: 'ADMIN_LIMIT_REACHED',
          message: 'This plan includes up to 3 administrators.',
          details: { maxAdmins: 3 },
        },
      }),
    });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAssignPropertyManager(42), {
      wrapper: Wrapper,
    });
    type AdminCapError = { code?: string; maxAdmins?: number; message: string };
    const error = (await result.current
      .mutateAsync({ userId: 'u9' })
      .catch((e) => e as AdminCapError)) as AdminCapError;
    expect(error.code).toBe('ADMIN_LIMIT_REACHED');
    expect(error.maxAdmins).toBe(3);
    expect(error.message).toMatch(/up to 3 administrators/);
  });
});

describe('useRevokePropertyManager', () => {
  it('DELETEs the right body', async () => {
    requestJsonMock.mockResolvedValueOnce({ revoked: true });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRevokePropertyManager(42), {
      wrapper: Wrapper,
    });
    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync({ userId: 'u9' });
    });
    expect(returned).toEqual({ revoked: true });
    const [url, init] = requestJsonMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/communities/role-assignments');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ communityId: 42, userId: 'u9' });
  });
});

describe('useTransferRoot', () => {
  it('POSTs toUserId', async () => {
    requestJsonMock.mockResolvedValueOnce({ transferred: true });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransferRoot(42), {
      wrapper: Wrapper,
    });
    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync({ toUserId: 'u9' });
    });
    expect(returned).toEqual({ transferred: true });
    const [url, init] = requestJsonMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/communities/transfer-root');
    expect(JSON.parse(init.body)).toEqual({ communityId: 42, toUserId: 'u9' });
  });
});

describe('useSetDesignation', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('returns {ok:true} on a 200 response', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { ok: true } }),
    });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSetDesignation(42), {
      wrapper: Wrapper,
    });
    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync({
        userId: 'u9',
        designation: 'board_member',
      });
    });
    expect(returned).toEqual({ ok: true });
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]!;
    expect(url).toBe('/api/v1/communities/designations');
    expect(JSON.parse(init.body)).toEqual({
      communityId: 42,
      userId: 'u9',
      designation: 'board_member',
    });
  });

  it('returns {ok:false, reason} on a 409 ack-required response', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        error: { code: 'NON_OWNER_ACK_REQUIRED', message: 'Ack required' },
      }),
    });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSetDesignation(42), {
      wrapper: Wrapper,
    });
    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync({
        userId: 'u9',
        designation: 'board_president',
      });
    });
    expect(returned).toEqual({ ok: false, reason: 'non_owner_requires_ack' });
  });

  it('throws on a non-409 error response', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'Forbidden' } }),
    });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSetDesignation(42), {
      wrapper: Wrapper,
    });
    await expect(
      result.current.mutateAsync({ userId: 'u9', designation: null }),
    ).rejects.toThrow('Forbidden');
  });
});
