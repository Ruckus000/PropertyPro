import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticleFeedback } from '@/components/help/article-feedback';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('ArticleFeedback', () => {
  it('resets hydrated feedback state when client navigation moves to an unrated article', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ data: { rating: 1, comment: 'Useful' } }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: null }));

    const Wrapper = createWrapper();
    const { container, rerender } = render(
      <ArticleFeedback
        communityId={42}
        articleSlug="start-here"
        articleCategory="getting-started"
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Helpful$/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    rerender(
      <ArticleFeedback
        communityId={42}
        articleSlug="billing"
        articleCategory="payments"
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-hydrated="false"]')).not.toBeNull();
      expect(screen.getByRole('button', { name: /^Helpful$/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    await waitFor(() => {
      expect(container.querySelector('[data-hydrated="true"]')).not.toBeNull();
      expect(screen.getByRole('button', { name: /^Helpful$/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(
        screen.getByRole('button', { name: /not helpful/i }),
      ).toHaveAttribute('aria-pressed', 'false');
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/help/feedback?communityId=42&articleSlug=start-here',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/help/feedback?communityId=42&articleSlug=billing',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
