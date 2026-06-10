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

const defaultProps = {
  communityId: 1,
  query: '',
  contextualArticles: [],
  readSlugs: null,
  onPickArticle: vi.fn(),
};

describe('<HelpDocsModalSearchPanel/>', () => {
  it('renders featured articles when no contextual articles and no query', () => {
    useHelpSearchMock.mockReturnValue({ data: null });
    useFeaturedArticlesMock.mockReturnValue({
      data: [
        { title: 'Welcome', description: 'Get started', category: 'getting-started', slug: 'welcome' },
      ],
    });
    render(withQuery(<HelpDocsModalSearchPanel {...defaultProps} />));
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
    render(withQuery(<HelpDocsModalSearchPanel {...defaultProps} onPickArticle={onPick} />));
    screen.getByRole('button', { name: /Welcome/ }).click();
    expect(onPick).toHaveBeenCalledWith('getting-started', 'welcome');
  });

  it('does not render the Featured heading when the hook returns an empty list', () => {
    useHelpSearchMock.mockReturnValue({ data: null });
    useFeaturedArticlesMock.mockReturnValue({ data: [] });
    render(withQuery(<HelpDocsModalSearchPanel {...defaultProps} />));
    expect(screen.queryByRole('heading', { name: /Featured for you/i })).not.toBeInTheDocument();
  });
});
