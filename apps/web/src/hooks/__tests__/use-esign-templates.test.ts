/**
 * Unit tests for usePresignEsignTemplateUpload (B5 batch 23 drain).
 *
 * Covers the documented exception to the requestJson rule: the hook throws
 * the bespoke literal 'Failed to prepare template PDF upload' regardless of
 * the API's error.message, and the response is destructured manually
 * (.data.path/.data.uploadUrl/.data.token) rather than via the standard
 * `{ data: T }` unwrap.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  usePresignEsignTemplateUpload,
  type PresignTemplateUploadInput,
} from '../use-esign-templates';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const input: PresignTemplateUploadInput = {
  communityId: 42,
  fileName: 'lease.pdf',
  fileSize: 1024,
  mimeType: 'application/pdf',
};

describe('usePresignEsignTemplateUpload', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs exact URL, method, headers, and body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { path: 'p', uploadUrl: 'u', token: 't' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePresignEsignTemplateUpload(), {
      wrapper,
    });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe('/api/v1/esign/templates/upload');
    expect(call[1]).toEqual({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        fileName: 'lease.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });
  });

  it('unwraps the { data: ... } envelope and returns { path, uploadUrl, token }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            path: 'communities/42/esign/abc.pdf',
            uploadUrl: 'https://storage.example.com/upload',
            token: 'signed-token',
          },
        }),
      }),
    );

    const { result } = renderHook(() => usePresignEsignTemplateUpload(), {
      wrapper,
    });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      path: 'communities/42/esign/abc.pdf',
      uploadUrl: 'https://storage.example.com/upload',
      token: 'signed-token',
    });
  });

  it('throws the bespoke literal on non-OK regardless of the API error.message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: { message: 'PDF rejected by storage backend' },
        }),
      }),
    );

    const { result } = renderHook(() => usePresignEsignTemplateUpload(), {
      wrapper,
    });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Failed to prepare template PDF upload',
    );
  });

  it('throws the bespoke literal when the non-OK body is non-JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error('not json');
        },
      }),
    );

    const { result } = renderHook(() => usePresignEsignTemplateUpload(), {
      wrapper,
    });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Failed to prepare template PDF upload',
    );
  });
});
