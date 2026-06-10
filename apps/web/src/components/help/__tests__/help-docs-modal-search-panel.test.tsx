import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HelpDocsModalSearchPanel } from '@/components/help/help-docs-modal-search-panel';

const searchMock = vi.fn();
const featuredMock = vi.fn();
vi.mock('@/hooks/use-help', () => ({
  useHelpSearch: (...args: unknown[]) => searchMock(...args),
  useFeaturedArticles: (...args: unknown[]) => featuredMock(...args),
}));

const contextual = Array.from({ length: 6 }, (_, i) => ({
  category: 'documents',
  slug: `doc-article-${i}`,
  title: `Doc article ${i}`,
  description: 'desc',
}));

function setup(props: Partial<Parameters<typeof HelpDocsModalSearchPanel>[0]> = {}) {
  searchMock.mockReturnValue({ data: undefined, isFetching: false });
  featuredMock.mockReturnValue({ data: [] });
  const onPickArticle = vi.fn();
  render(
    <HelpDocsModalSearchPanel
      communityId={1}
      query=""
      contextualArticles={contextual}
      readSlugs={new Set(['doc-article-0'])}
      onPickArticle={onPickArticle}
      {...props}
    />,
  );
  return { onPickArticle };
}

describe('HelpDocsModalSearchPanel', () => {
  it('lists all contextual matches behind a show-more toggle', () => {
    setup();
    expect(screen.getByText(/Help for this page · 6 articles/)).toBeInTheDocument();
    expect(screen.queryByText('Doc article 5')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show 2 more/ }));
    expect(screen.getByText('Doc article 5')).toBeInTheDocument();
  });

  it('marks read articles with a checkmark', () => {
    setup();
    expect(screen.getByLabelText('Read')).toBeInTheDocument();
  });

  it('renders FAQ search results (previously dropped)', () => {
    searchMock.mockReturnValue({
      data: {
        articles: [],
        faqs: [{ id: 1, question: 'When are assessments posted?', answer: 'On the 1st.' }],
      },
      isFetching: false,
    });
    featuredMock.mockReturnValue({ data: [] });
    render(
      <HelpDocsModalSearchPanel
        communityId={1}
        query="assessments"
        contextualArticles={[]}
        readSlugs={null}
        onPickArticle={vi.fn()}
      />,
    );
    expect(screen.getByText('When are assessments posted?')).toBeInTheDocument();
  });

  it('shows featured fallback when contextual list is empty and not searching', () => {
    searchMock.mockReturnValue({ data: undefined, isFetching: false });
    featuredMock.mockReturnValue({
      data: [{ category: 'getting-started', slug: 'welcome', title: 'Welcome', description: 'Get started' }],
    });
    render(
      <HelpDocsModalSearchPanel
        communityId={1}
        query=""
        contextualArticles={[]}
        readSlugs={null}
        onPickArticle={vi.fn()}
      />,
    );
    expect(screen.getByText('Featured for you')).toBeInTheDocument();
    expect(screen.getByText('Welcome')).toBeInTheDocument();
  });

  it('does NOT show featured fallback when contextual articles are present', () => {
    featuredMock.mockReturnValue({
      data: [{ category: 'getting-started', slug: 'welcome', title: 'Welcome', description: 'Get started' }],
    });
    setup();
    expect(screen.queryByText('Featured for you')).toBeNull();
  });

  it('shows article search results with read checkmark', () => {
    searchMock.mockReturnValue({
      data: {
        articles: [{ category: 'documents', slug: 'uploading-documents', title: 'Uploading documents', description: 'How to upload' }],
        faqs: [],
      },
      isFetching: false,
    });
    featuredMock.mockReturnValue({ data: [] });
    render(
      <HelpDocsModalSearchPanel
        communityId={1}
        query="upload"
        contextualArticles={[]}
        readSlugs={new Set(['uploading-documents'])}
        onPickArticle={vi.fn()}
      />,
    );
    expect(screen.getByText('Uploading documents')).toBeInTheDocument();
    expect(screen.getByLabelText('Read')).toBeInTheDocument();
  });
});
