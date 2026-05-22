import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HelpDocsModalSearchPanel } from '../../src/components/help/help-docs-modal-search-panel';

const useHelpSearchMock = vi.fn();
const useFeaturedArticlesMock = vi.fn();

vi.mock('../../src/hooks/use-help', () => ({
  useHelpSearch: (...args: unknown[]) => useHelpSearchMock(...args),
  useFeaturedArticles: (...args: unknown[]) => useFeaturedArticlesMock(...args),
  HELP_KEYS: {},
}));

function withQuery(children: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('<HelpDocsModalSearchPanel/>', () => {
  it('renders the search input and featured articles', () => {
    useHelpSearchMock.mockReturnValue({ data: null });
    useFeaturedArticlesMock.mockReturnValue({
      data: [
        { title: 'Welcome', description: 'Get started', category: 'getting-started', slug: 'welcome' },
      ],
    });
    render(
      withQuery(<HelpDocsModalSearchPanel communityId={1} onPickArticle={() => {}} />),
    );
    expect(screen.getByPlaceholderText(/Search help articles/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Welcome/ })).toBeInTheDocument();
  });

  it('calls onPickArticle when a featured article is clicked', () => {
    useHelpSearchMock.mockReturnValue({ data: null });
    useFeaturedArticlesMock.mockReturnValue({
      data: [
        { title: 'Welcome', description: 'Get started', category: 'getting-started', slug: 'welcome' },
      ],
    });
    const onPick = vi.fn();
    render(
      withQuery(<HelpDocsModalSearchPanel communityId={1} onPickArticle={onPick} />),
    );
    screen.getByRole('button', { name: /Welcome/ }).click();
    expect(onPick).toHaveBeenCalledWith('getting-started', 'welcome');
  });

  it('renders the empty state (not the Featured heading) when the hook returns an empty list', () => {
    useHelpSearchMock.mockReturnValue({ data: null });
    useFeaturedArticlesMock.mockReturnValue({ data: [] });
    render(
      withQuery(<HelpDocsModalSearchPanel communityId={1} onPickArticle={() => {}} />),
    );
    expect(screen.queryByRole('heading', { name: /Featured for you/i })).not.toBeInTheDocument();
    expect(screen.getByText(/haven't been written yet/i)).toBeInTheDocument();
  });
});
