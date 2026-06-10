import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HelpArticleBody } from '../../src/components/help/help-article-body';
import type { HelpArticleMetadata } from '../../src/lib/services/help-article-service';

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
  it('renders precompiled article HTML and title', () => {
    render(
      withQueryClient(
        <HelpArticleBody
          html='<h2 id="heading">Heading</h2><p>Compiled HTML</p>'
          metadata={baseMetadata}
          related={[]}
          communityId={1}
          onOpenArticle={vi.fn()}
        />,
      ),
    );
    expect(screen.getByText('Compiled HTML')).toBeInTheDocument();
    expect(screen.getByTestId('view-tracker')).toBeInTheDocument();
    expect(screen.getByTestId('feedback')).toBeInTheDocument();
  });

  it('renders the article title as h1', () => {
    render(
      withQueryClient(
        <HelpArticleBody
          html='<p>x</p>'
          metadata={baseMetadata}
          related={[]}
          communityId={1}
          onOpenArticle={vi.fn()}
        />,
      ),
    );
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fixing compliance gaps');
  });

  it('renders related articles as buttons when present', () => {
    render(
      withQueryClient(
        <HelpArticleBody
          html='<p>x</p>'
          metadata={baseMetadata}
          related={[{ ...baseMetadata, slug: 'related-slug', title: 'Related Article' }]}
          communityId={1}
          onOpenArticle={vi.fn()}
        />,
      ),
    );
    expect(screen.getByRole('button', { name: /Related Article/ })).toBeInTheDocument();
  });
});
