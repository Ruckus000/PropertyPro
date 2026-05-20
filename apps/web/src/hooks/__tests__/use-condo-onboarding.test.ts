/**
 * Unit tests for useSaveCondoStep / useCompleteCondoOnboarding
 * (B5 batch 22 drain of condo-wizard.tsx).
 *
 * Documented exception to the requestJson rule: the wizard renders the
 * thrown error's `.message` verbatim. The hook parses the route's
 * `{ error: string | { code?, message? } }` envelope through `readApiError`
 * with a `'Request failed'` fallback. Tests pin that exact behavior.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useSaveCondoStep,
  useCompleteCondoOnboarding,
} from '../use-condo-onboarding';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

// readOnboardingApiError now inspects `Content-Type` before parsing JSON.
// All non-OK Response mocks in this file represent JSON error responses,
// so they need a headers stub that returns 'application/json'.
const jsonResponseHeaders = {
  get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
};

describe('useSaveCondoStep', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PATCHes exact URL, method, headers, body on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSaveCondoStep(42), { wrapper });
    result.current.mutate({ step: 0, patch: { profile: { name: 'X' } as never } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/v1/onboarding/condo?communityId=42');
    expect(init.method).toBe('PATCH');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({
      communityId: 42,
      step: 0,
      stepData: { profile: { name: 'X' } },
    });
  });

  it('throws the string `error` value verbatim on non-OK', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      headers: jsonResponseHeaders,
      json: async () => ({ error: 'short' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSaveCondoStep(42), { wrapper });
    result.current.mutate({ step: 0, patch: {} });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('short');
  });

  it('throws the object error.message verbatim on non-OK', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      headers: jsonResponseHeaders,
      json: async () => ({ error: { message: 'X' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSaveCondoStep(42), { wrapper });
    result.current.mutate({ step: 0, patch: {} });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('X');
  });

  it('falls back to "Request failed" when the body is unparseable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      headers: jsonResponseHeaders,
      json: async () => {
        throw new Error('not json');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSaveCondoStep(42), { wrapper });
    result.current.mutate({ step: 0, patch: {} });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Request failed');
  });
});

describe('useCompleteCondoOnboarding', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs exact URL, method, headers, body on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCompleteCondoOnboarding(42), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/v1/onboarding/condo?communityId=42');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({
      communityId: 42,
      action: 'complete',
    });
  });

  it('throws the object error.message verbatim on non-OK', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      headers: jsonResponseHeaders,
      json: async () => ({ error: { message: 'fail' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCompleteCondoOnboarding(42), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('fail');
  });
});
