/**
 * Unit tests for useSubmitAccessRequest / useVerifyAccessRequest
 * (B5 batch #13 drain of access-requests/request-access-form.tsx).
 *
 * Documented exception to the requestJson rule: the form renders the thrown
 * error's `.message` verbatim and depends on the exact fallback literals
 * `'Something went wrong. Please try again.'` /
 * `'Verification failed. Please try again.'`, so the hooks keep a raw fetch +
 * manual non-OK throw rather than delegating to requestJson.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useSubmitAccessRequest,
  useVerifyAccessRequest,
  type SubmitAccessRequestPayload,
} from '../use-access-request-form';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const submitPayload: SubmitAccessRequestPayload = {
  communityId: 42,
  communitySlug: 'sunset-condos',
  email: 'jane@example.com',
  fullName: 'Jane Smith',
  phone: undefined,
  claimedUnitNumber: '4B',
  isUnitOwner: true,
  refCode: 'PROMO',
};

describe('useSubmitAccessRequest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs exact URL/method/headers/body and resolves { requestId }', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { requestId: 99 } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSubmitAccessRequest(), { wrapper });
    result.current.mutate(submitPayload);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/v1/access-requests');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    // Exact body: phone:undefined drops from JSON; claimedUnitNumber kept.
    expect(init.body).toBe(
      JSON.stringify({
        communityId: 42,
        communitySlug: 'sunset-condos',
        email: 'jane@example.com',
        fullName: 'Jane Smith',
        phone: undefined,
        claimedUnitNumber: '4B',
        isUnitOwner: true,
        refCode: 'PROMO',
      }),
    );
    // phone:undefined is serialized away by JSON.stringify
    expect(JSON.parse(init.body as string)).not.toHaveProperty('phone');
    expect(result.current.data).toEqual({ requestId: 99 });
  });

  it('serializes claimedUnitNumber: undefined when omitted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { requestId: 1 } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSubmitAccessRequest(), { wrapper });
    result.current.mutate({ ...submitPayload, claimedUnitNumber: undefined });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty('claimedUnitNumber');
  });

  it('throws the server message on non-OK with { message }', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Email already registered' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSubmitAccessRequest(), { wrapper });
    result.current.mutate(submitPayload);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Email already registered');
  });

  it('throws the exact fallback literal on non-OK non-JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error('not json');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSubmitAccessRequest(), { wrapper });
    result.current.mutate(submitPayload);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('throws the exact fallback literal on a 2xx body missing data.requestId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSubmitAccessRequest(), { wrapper });
    result.current.mutate(submitPayload);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('useVerifyAccessRequest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs exact URL/method/body and resolves on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useVerifyAccessRequest(), { wrapper });
    result.current.mutate({ requestId: 99, otp: '123456', communityId: 42 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/v1/access-requests/verify');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.body).toBe(
      JSON.stringify({ requestId: 99, otp: '123456', communityId: 42 }),
    );
    expect(result.current.data).toBeUndefined();
  });

  it('throws the server message on non-OK with { message }', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Invalid or expired code' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useVerifyAccessRequest(), { wrapper });
    result.current.mutate({ requestId: 99, otp: '000000', communityId: 42 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Invalid or expired code');
  });

  it('throws the exact fallback literal on non-OK non-JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error('not json');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useVerifyAccessRequest(), { wrapper });
    result.current.mutate({ requestId: 99, otp: '000000', communityId: 42 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Verification failed. Please try again.',
    );
  });
});
