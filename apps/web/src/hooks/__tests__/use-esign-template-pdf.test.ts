/**
 * Unit tests for useEsignTemplatePdfUrl (B5 batch 4C drain of
 * template-detail-client.tsx).
 *
 * The route returns the standard `{ data: { pdfUrl } }` envelope, so the hook
 * delegates to `requestJson` which unwraps `.data`. The hook resolves to
 * `{ pdfUrl }`.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useEsignTemplatePdfUrl,
  ESIGN_TEMPLATE_PDF_QUERY_KEY,
} from '../use-esign-template-pdf';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('ESIGN_TEMPLATE_PDF_QUERY_KEY', () => {
  it('is a stable factory keyed on communityId + templateId', () => {
    expect(ESIGN_TEMPLATE_PDF_QUERY_KEY(3, 9)).toEqual([
      'esign-template-pdf',
      3,
      9,
    ]);
    expect(ESIGN_TEMPLATE_PDF_QUERY_KEY(3, 9)).toEqual(
      ESIGN_TEMPLATE_PDF_QUERY_KEY(3, 9),
    );
    expect(ESIGN_TEMPLATE_PDF_QUERY_KEY(3, 9)).not.toEqual(
      ESIGN_TEMPLATE_PDF_QUERY_KEY(3, 10),
    );
  });
});

describe('useEsignTemplatePdfUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not fetch when disabled (enabled=false)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () =>
        useEsignTemplatePdfUrl({
          communityId: 1,
          templateId: 5,
          enabled: false,
        }),
      { wrapper },
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('does not fetch when communityId/templateId are not positive', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderHook(
      () =>
        useEsignTemplatePdfUrl({
          communityId: 0,
          templateId: 5,
          enabled: true,
        }),
      { wrapper },
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches exact URL with ?communityId via URLSearchParams, GET, forwards AbortSignal, and unwraps the envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { pdfUrl: 'https://signed.example/doc.pdf' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () =>
        useEsignTemplatePdfUrl({
          communityId: 1,
          templateId: 5,
          enabled: true,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/esign/templates/5/pdf?communityId=1');
    expect(init.method).toBe('GET');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(result.current.data).toEqual({
      pdfUrl: 'https://signed.example/doc.pdf',
    });
  });

  it('errors on non-OK response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'No PDF available' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () =>
        useEsignTemplatePdfUrl({
          communityId: 1,
          templateId: 5,
          enabled: true,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('No PDF available');
  });

  it('refetches when the query key (templateId) changes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { pdfUrl: 'https://signed.example/doc.pdf' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ templateId }: { templateId: number }) =>
        useEsignTemplatePdfUrl({
          communityId: 1,
          templateId,
          enabled: true,
        }),
      { wrapper, initialProps: { templateId: 5 } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ templateId: 6 });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [secondUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(secondUrl).toBe('/api/v1/esign/templates/6/pdf?communityId=1');
  });
});
