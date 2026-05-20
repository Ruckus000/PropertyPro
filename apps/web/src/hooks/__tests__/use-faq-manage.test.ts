/**
 * Unit tests for useUpdateFaq / useCreateFaq / useDeleteFaq
 * (B5 batch 24 drain of help-faq-manage-client.tsx).
 *
 * Documented exception to the requestJson rule: each mutation throws bespoke
 * per-operation error literals that the component renders verbatim in an
 * inline error banner; the POST path also rejects 200 responses with missing
 * `data`. requestJson's generic 'Request failed' fallback would not match.
 * Raw fetch + readApiError preserve byte-for-byte.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useCreateFaq,
  useDeleteFaq,
  useReorderFaqs,
  useUpdateFaq,
} from '../use-faq-manage';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const COMMUNITY_ID = 7;

describe('useUpdateFaq', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PATCHes /api/v1/faqs/:id with the community + question + answer payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUpdateFaq(COMMUNITY_ID), { wrapper });

    await result.current.mutateAsync({ id: 42, question: 'Q', answer: 'A' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/faqs/42');
    expect(init.method).toBe('PATCH');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      communityId: COMMUNITY_ID,
      question: 'Q',
      answer: 'A',
    });
  });

  it('rejects with the server error message on non-OK with parseable body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Question is required' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUpdateFaq(COMMUNITY_ID), { wrapper });

    await expect(
      result.current.mutateAsync({ id: 1, question: '', answer: '' }),
    ).rejects.toThrow('Question is required');
  });

  it('rejects with the generic literal on non-OK with unparseable body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error('bad')),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUpdateFaq(COMMUNITY_ID), { wrapper });

    await expect(
      result.current.mutateAsync({ id: 1, question: 'Q', answer: 'A' }),
    ).rejects.toThrow('Unable to save FAQ changes right now.');
  });
});

describe('useCreateFaq', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to /api/v1/faqs and returns the created FAQ on success', async () => {
    const createdFaq = {
      id: 99,
      question: 'New?',
      answer: 'Yes.',
      sortOrder: 5,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: createdFaq }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCreateFaq(COMMUNITY_ID), { wrapper });

    const returned = await result.current.mutateAsync({
      question: 'New?',
      answer: 'Yes.',
    });

    expect(returned).toEqual(createdFaq);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/faqs');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      communityId: COMMUNITY_ID,
      question: 'New?',
      answer: 'Yes.',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rejects with the server error message on non-OK', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Bad input' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCreateFaq(COMMUNITY_ID), { wrapper });

    await expect(
      result.current.mutateAsync({ question: 'Q', answer: 'A' }),
    ).rejects.toThrow('Bad input');
  });

  it('rejects with the create-fallback literal when 200 response is missing `data`', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCreateFaq(COMMUNITY_ID), { wrapper });

    await expect(
      result.current.mutateAsync({ question: 'Q', answer: 'A' }),
    ).rejects.toThrow('Unable to create this FAQ right now.');
  });
});

describe('useDeleteFaq', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('DELETEs /api/v1/faqs/:id with communityId query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDeleteFaq(COMMUNITY_ID), { wrapper });

    await result.current.mutateAsync(15);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/v1/faqs/15?communityId=${COMMUNITY_ID}`);
    expect(init.method).toBe('DELETE');
  });

  it('rejects with the server error message on non-OK with parseable body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Forbidden' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDeleteFaq(COMMUNITY_ID), { wrapper });

    await expect(result.current.mutateAsync(1)).rejects.toThrow('Forbidden');
  });

  it('rejects with the generic literal on non-OK with unparseable body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error('bad')),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDeleteFaq(COMMUNITY_ID), { wrapper });

    await expect(result.current.mutateAsync(1)).rejects.toThrow(
      'Unable to delete this FAQ right now.',
    );
  });
});

describe('useReorderFaqs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PATCHes /api/v1/faqs/reorder with the communityId + ids payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useReorderFaqs(COMMUNITY_ID), { wrapper });

    await result.current.mutateAsync([3, 1, 2]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/faqs/reorder');
    expect(init.method).toBe('PATCH');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      communityId: COMMUNITY_ID,
      ids: [3, 1, 2],
    });
  });

  it('still resolves on non-OK responses (mobile UX silently swallows reorder errors)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'boom' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useReorderFaqs(COMMUNITY_ID), { wrapper });

    await expect(result.current.mutateAsync([1, 2])).resolves.toBeUndefined();
  });

  it('rejects with the friendly literal on network errors (fetch throws)', async () => {
    const networkError = new TypeError('Failed to fetch');
    const fetchMock = vi.fn().mockRejectedValue(networkError);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useReorderFaqs(COMMUNITY_ID), { wrapper });

    await expect(result.current.mutateAsync([1, 2])).rejects.toThrow(
      'Unable to reorder FAQs right now.',
    );
  });
});
