import { StrictMode } from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArticleViewTracker } from '../../src/components/help/article-view-tracker';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ArticleViewTracker', () => {
  it('logs one best-effort article view with keepalive under StrictMode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <StrictMode>
        <ArticleViewTracker
          communityId={42}
          articleSlug="welcome-to-propertypro"
          articleCategory="getting-started"
        />
      </StrictMode>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/help/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        articleSlug: 'welcome-to-propertypro',
        articleCategory: 'getting-started',
      }),
      keepalive: true,
    });
  });

  it('tracks a new article when client-side navigation reuses the mounted tracker', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(
      <ArticleViewTracker
        communityId={42}
        articleSlug="welcome-to-propertypro"
        articleCategory="getting-started"
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(
      <ArticleViewTracker
        communityId={42}
        articleSlug="reviewing-the-compliance-dashboard"
        articleCategory="compliance"
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/help/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        articleSlug: 'reviewing-the-compliance-dashboard',
        articleCategory: 'compliance',
      }),
      keepalive: true,
    });
  });

  it('swallows tracking failures so article rendering is not blocked', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network unavailable'));
    vi.stubGlobal('fetch', fetchMock);

    expect(() =>
      render(
        <ArticleViewTracker
          communityId={42}
          articleSlug="welcome-to-propertypro"
          articleCategory="getting-started"
        />,
      ),
    ).not.toThrow();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
