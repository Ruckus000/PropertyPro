import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HELP_KEYS,
  useArticleFeedback,
  useHelpArticle,
  useSubmitArticleFeedback,
} from '../use-help';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useArticleFeedback', () => {
  it('hydrates the current article feedback through the standard data envelope', async () => {
    const { wrapper } = createWrapper();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { rating: -1, comment: 'Needs screenshots' } }),
    );

    const { result } = renderHook(
      () => useArticleFeedback({ communityId: 42, articleSlug: 'start-here' }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/help/feedback?communityId=42&articleSlug=start-here',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.data).toEqual({
      rating: -1,
      comment: 'Needs screenshots',
    });
  });

  it('preserves null feedback responses as an empty prior rating', async () => {
    const { wrapper } = createWrapper();
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: null }));

    const { result } = renderHook(
      () => useArticleFeedback({ communityId: 42, articleSlug: 'start-here' }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeNull();
  });
});

describe('useSubmitArticleFeedback', () => {
  it('posts feedback through requestJson and warms the article feedback cache from the server response', async () => {
    const { queryClient, wrapper } = createWrapper();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { id: 9, rating: -1, comment: 'Server-trimmed' } }, 201),
    );

    const { result } = renderHook(() => useSubmitArticleFeedback(), { wrapper });

    await result.current.mutateAsync({
      communityId: 42,
      articleSlug: 'start-here',
      articleCategory: 'getting-started',
      rating: -1,
      comment: '  Server-trimmed  ',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/help/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        articleSlug: 'start-here',
        articleCategory: 'getting-started',
        rating: -1,
        comment: '  Server-trimmed  ',
      }),
    });
    expect(
      queryClient.getQueryData(HELP_KEYS.articleFeedback(42, 'start-here')),
    ).toEqual({ rating: -1, comment: 'Server-trimmed' });
  });

  it('surfaces API envelope errors to the component', async () => {
    const { wrapper } = createWrapper();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { message: 'Unable to save feedback' } }, 500),
    );

    const { result } = renderHook(() => useSubmitArticleFeedback(), { wrapper });

    await expect(
      result.current.mutateAsync({
        communityId: 42,
        articleSlug: 'start-here',
        articleCategory: 'getting-started',
        rating: -1,
        comment: 'Missing the setup step',
      }),
    ).rejects.toThrow('Unable to save feedback');
  });
});

describe('useHelpArticle', () => {
  it('does not fetch when category or slug is null', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useHelpArticle(null, null, 1), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches and returns article on success', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          source: { compiledSource: 'compiled', frontmatter: {}, scope: {} },
          toc: [{ depth: 2, label: 'Heading', anchor: 'heading' }],
          metadata: { slug: 's', category: 'c', title: 't' },
          related: [],
        },
      }),
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useHelpArticle('c', 's', 42), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.metadata.slug).toBe('s');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/help/article?category=c&slug=s&communityId=42'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('surfaces error on 404', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Not found' }, 404));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useHelpArticle('c', 's', 42), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
