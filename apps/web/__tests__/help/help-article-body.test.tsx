import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HelpArticleBody } from '../../src/components/help/help-article-body';
import type { HelpArticleMetadata } from '../../src/lib/services/help-article-service';

vi.mock('next-mdx-remote', () => ({
  MDXRemote: ({ compiledSource }: { compiledSource: string }) => (
    <div data-testid="mdx">{compiledSource}</div>
  ),
}));

vi.mock('../../src/components/help/article-view-tracker', () => ({
  ArticleViewTracker: () => <div data-testid="view-tracker" />,
}));

vi.mock('../../src/components/help/article-feedback', () => ({
  ArticleFeedback: () => <div data-testid="feedback" />,
}));

const baseMetadata: HelpArticleMetadata = {
  title: 'Fixing compliance gaps',
  description: 'How to resolve flagged gaps.',
  category: 'compliance',
  slug: 'fixing-compliance-gaps',
  roles: ['board_member'],
  keywords: [],
  tags: [],
  relatedArticles: [],
  featured: false,
  excerpt: '',
  filePath: '/tmp/article.mdx',
  contextPaths: [],
  statutes: [],
  featureGates: [],
  updatedAt: '2026-05-01',
  readTimeMinutes: 3,
  contentHash: 'abc',
};

function withQueryClient(children: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('<HelpArticleBody/>', () => {
  it('renders MDX body and TOC in modal mode', () => {
    render(
      withQueryClient(
        <HelpArticleBody
          source={{ compiledSource: 'compiled-html', frontmatter: {}, scope: {} } as never}
          toc={[{ depth: 2, label: 'Heading', anchor: 'heading' }]}
          metadata={baseMetadata}
          related={[]}
          communityId={1}
          displayMode="modal"
        />,
      ),
    );
    expect(screen.getByTestId('mdx')).toHaveTextContent('compiled-html');
    // TOC renders in both mobile (details) and desktop (aside) — at least one match is sufficient
    expect(screen.getAllByText('Heading').length).toBeGreaterThan(0);
    expect(screen.getByTestId('view-tracker')).toBeInTheDocument();
    expect(screen.getByTestId('feedback')).toBeInTheDocument();
  });

  it('does not render the page-level chrome in modal mode', () => {
    render(
      withQueryClient(
        <HelpArticleBody
          source={{ compiledSource: 'x', frontmatter: {}, scope: {} } as never}
          toc={[]}
          metadata={baseMetadata}
          related={[]}
          communityId={1}
          displayMode="modal"
        />,
      ),
    );
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('renders related articles when present', () => {
    render(
      withQueryClient(
        <HelpArticleBody
          source={{ compiledSource: 'x', frontmatter: {}, scope: {} } as never}
          toc={[]}
          metadata={baseMetadata}
          related={[{ ...baseMetadata, slug: 'related-slug', title: 'Related Article' }]}
          communityId={1}
          displayMode="modal"
        />,
      ),
    );
    expect(screen.getByRole('link', { name: /Related Article/ })).toBeInTheDocument();
  });
});
