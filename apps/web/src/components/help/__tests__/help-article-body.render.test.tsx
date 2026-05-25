import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { HelpArticleBody } from '../help-article-body';

vi.stubGlobal(
  'fetch',
  vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ data: null }), {
        headers: { 'content-type': 'application/json' },
      }),
    ),
  ),
);

describe('HelpArticleBody modal renderer', () => {
  it('renders precompiled help HTML without client-side MDX evaluation', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <HelpArticleBody
          html={'<h2 id="getting-started">Getting started</h2><p>Use the help center.</p>'}
          toc={[{ depth: 2, label: 'Getting started', anchor: 'getting-started' }]}
          metadata={{
            title: 'Welcome',
            description: 'Intro',
            category: 'getting-started',
            slug: 'welcome',
            roles: [],
            keywords: [],
            tags: [],
            relatedArticles: [],
            featured: true,
            filePath: '/tmp/welcome.mdx',
            contentHash: 'abc',
          }}
          related={[]}
          communityId={1}
          displayMode="modal"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Getting started' })).toBeInTheDocument();
  });
});
