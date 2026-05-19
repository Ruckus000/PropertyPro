/**
 * Unit tests for useSaveBranding (B5 batch #12 drain of pm/BrandingForm.tsx).
 *
 * Documented exception to the requestJson rule: the component renders the
 * thrown error's `.message` verbatim, so the hook keeps manual fetch + non-OK
 * throws with the exact literals 'Failed to prepare logo upload',
 * 'Failed to upload logo', and the PATCH
 * `json.error?.message ?? 'Failed to save branding'`. The second leg also PUTs
 * to an external Supabase URL (not /api/v1).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useSaveBranding, type SaveBrandingInput } from '../use-branding-form';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const baseInput: Omit<SaveBrandingInput, 'logoFile'> = {
  communityId: 42,
  primaryColor: '#2563eb',
  secondaryColor: '#6b7280',
  accentColor: '#DBEAFE',
  fontHeading: 'Inter',
  fontBody: 'Inter',
  customEmailFooter: 'Contact us',
};

const noLogoInput: SaveBrandingInput = { ...baseInput, logoFile: null };

function makeLogo() {
  return new File(['logo-bytes'], 'logo.png', { type: 'image/png' });
}

describe('useSaveBranding', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no-logo path: only the PATCH fires with exact URL/method/body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSaveBranding(), { wrapper });
    result.current.mutate(noLogoInput);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/pm/branding', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        primaryColor: '#2563eb',
        secondaryColor: '#6b7280',
        accentColor: '#DBEAFE',
        fontHeading: 'Inter',
        fontBody: 'Inter',
        customEmailFooter: 'Contact us',
      }),
    });
  });

  it('empty customEmailFooter collapses to undefined (omitted from JSON)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSaveBranding(), { wrapper });
    result.current.mutate({ ...noLogoInput, customEmailFooter: '' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const patchInit = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(patchInit.body).toBe(
      JSON.stringify({
        communityId: 42,
        primaryColor: '#2563eb',
        secondaryColor: '#6b7280',
        accentColor: '#DBEAFE',
        fontHeading: 'Inter',
        fontBody: 'Inter',
        customEmailFooter: undefined,
      }),
    );
  });

  it('with-logo path: presign POST, external PUT, then PATCH with the new path', async () => {
    const file = makeLogo();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { path: 'communities/42/documents/x/logo.png', uploadUrl: 'https://storage.example/up' },
        }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSaveBranding(), { wrapper });
    result.current.mutate({ ...baseInput, logoFile: file });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(3);

    // 1. presign POST
    expect(fetchMock.mock.calls[0]!).toEqual([
      '/api/v1/upload',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 42,
          fileName: 'logo.png',
          fileSize: file.size,
          mimeType: 'image/png',
        }),
      },
    ]);

    // 2. external PUT to the presign uploadUrl
    expect(fetchMock.mock.calls[1]!).toEqual([
      'https://storage.example/up',
      { method: 'PUT', headers: { 'content-type': 'image/png' }, body: file },
    ]);

    // 3. PATCH with the new storage path appended
    const patchInit = fetchMock.mock.calls[2]![1] as RequestInit;
    expect(fetchMock.mock.calls[2]![0]).toBe('/api/v1/pm/branding');
    expect(patchInit.method).toBe('PATCH');
    expect(patchInit.body).toBe(
      JSON.stringify({
        communityId: 42,
        primaryColor: '#2563eb',
        secondaryColor: '#6b7280',
        accentColor: '#DBEAFE',
        fontHeading: 'Inter',
        fontBody: 'Inter',
        customEmailFooter: 'Contact us',
        logoStoragePath: 'communities/42/documents/x/logo.png',
      }),
    );
  });

  it('presign non-OK rejects with "Failed to prepare logo upload" (PUT+PATCH not called)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSaveBranding(), { wrapper });
    result.current.mutate({ ...baseInput, logoFile: makeLogo() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to prepare logo upload');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('PUT non-OK rejects with "Failed to upload logo" (PATCH not called)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { path: 'p', uploadUrl: 'https://storage.example/up' } }),
      })
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSaveBranding(), { wrapper });
    result.current.mutate({ ...baseInput, logoFile: makeLogo() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to upload logo');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('PATCH non-OK with {error:{message}} rejects with that message', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Only PMs can update branding' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSaveBranding(), { wrapper });
    result.current.mutate(noLogoInput);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Only PMs can update branding');
  });

  it('PATCH non-OK without message rejects with "Failed to save branding"', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSaveBranding(), { wrapper });
    result.current.mutate(noLogoInput);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to save branding');
  });

  it('PATCH non-OK with a NON-JSON error body still rejects with "Failed to save branding"', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new Error('Unexpected token < in JSON');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSaveBranding(), { wrapper });
    result.current.mutate(noLogoInput);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to save branding');
  });
});
