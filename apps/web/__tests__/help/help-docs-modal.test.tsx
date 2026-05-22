import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom doesn't implement window.matchMedia — stub it so useIsMobile and
// HelpWidgetProvider's keyboard-shortcut useEffect don't throw.
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});
import { HelpDocsModal } from '../../src/components/help/help-docs-modal';
import {
  HelpWidgetProvider,
  useHelpWidget,
} from '../../src/components/help/help-widget-provider';

const useContextualHelpMock = vi.fn();
const useHelpArticleMock = vi.fn();
const usePathnameMock = vi.fn();

vi.mock('../../src/hooks/use-help', async () => {
  const actual = await vi.importActual<typeof import('../../src/hooks/use-help')>(
    '../../src/hooks/use-help',
  );
  return {
    ...actual,
    useContextualHelp: (...args: unknown[]) => useContextualHelpMock(...args),
    useHelpArticle: (...args: unknown[]) => useHelpArticleMock(...args),
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}));

vi.mock('../../src/components/help/help-article-body', () => ({
  HelpArticleBody: ({ metadata }: { metadata: { title: string } }) => (
    <div data-testid="article-body">{metadata.title}</div>
  ),
}));

vi.mock('../../src/components/help/help-docs-modal-search-panel', () => ({
  HelpDocsModalSearchPanel: () => <div data-testid="search-panel" />,
}));

function withProviders(children: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <HelpWidgetProvider>{children}</HelpWidgetProvider>
    </QueryClientProvider>
  );
}

function Opener() {
  const { open } = useHelpWidget();
  return <button onClick={open}>open help</button>;
}

describe('<HelpDocsModal/>', () => {
  it('renders nothing when flag is off', () => {
    usePathnameMock.mockReturnValue('/compliance');
    useContextualHelpMock.mockReturnValue({ data: [], isFetching: false });
    useHelpArticleMock.mockReturnValue({ data: null, isLoading: false });
    render(
      withProviders(<HelpDocsModal communityId={1} flagEnabled={false} />),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens to the contextual article when one matches', async () => {
    usePathnameMock.mockReturnValue('/compliance');
    useContextualHelpMock.mockReturnValue({
      data: [{ title: 'Fixing gaps', category: 'compliance', slug: 'fixing-gaps', description: '' }],
      isFetching: false,
    });
    useHelpArticleMock.mockReturnValue({
      data: {
        source: { compiledSource: 'x', frontmatter: {}, scope: {} },
        toc: [],
        metadata: { title: 'Fixing gaps', slug: 'fixing-gaps', category: 'compliance' },
        related: [],
      },
      isLoading: false,
      isError: false,
    });

    render(
      withProviders(
        <>
          <Opener />
          <HelpDocsModal communityId={1} flagEnabled />
        </>,
      ),
    );

    screen.getByText('open help').click();

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByTestId('article-body')).toHaveTextContent('Fixing gaps');
  });

  it('falls back to search panel when no contextual match', async () => {
    usePathnameMock.mockReturnValue('/dashboard');
    useContextualHelpMock.mockReturnValue({ data: [], isFetching: false });
    useHelpArticleMock.mockReturnValue({ data: null, isLoading: false, isError: false });

    render(
      withProviders(
        <>
          <Opener />
          <HelpDocsModal communityId={1} flagEnabled />
        </>,
      ),
    );

    screen.getByText('open help').click();

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByTestId('search-panel')).toBeInTheDocument();
  });

  it('shows an error banner when article fetch fails', async () => {
    usePathnameMock.mockReturnValue('/compliance');
    useContextualHelpMock.mockReturnValue({
      data: [{ title: 'X', category: 'c', slug: 's', description: '' }],
      isFetching: false,
    });
    useHelpArticleMock.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    render(
      withProviders(
        <>
          <Opener />
          <HelpDocsModal communityId={1} flagEnabled />
        </>,
      ),
    );

    screen.getByText('open help').click();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/couldn't load this article/i)).toBeInTheDocument();
  });
});
