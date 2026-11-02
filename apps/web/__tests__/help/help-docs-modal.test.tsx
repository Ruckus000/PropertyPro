import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../../src/lib/help/category-meta', () => ({
  getHelpCategoryMeta: () => ({
    label: 'Test Category',
    icon: () => null,
    chipClass: 'test-chip',
  }),
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

function ArticleOpener({ category, slug }: { category: string; slug: string }) {
  const { openArticle } = useHelpWidget();
  return <button onClick={() => openArticle(category, slug)}>open article</button>;
}

describe('<HelpDocsModal/>', () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue('/compliance');
    useContextualHelpMock.mockReturnValue({ data: [], isFetching: false });
    useHelpArticleMock.mockReturnValue({ data: null, isPending: false, isError: false });
  });

  it('renders nothing when flag is off', () => {
    render(
      withProviders(<HelpDocsModal communityId={1} flagEnabled={false} />),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows search panel when no article is selected', async () => {
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

  it('renders the article body when an article is selected via openArticle', async () => {
    useHelpArticleMock.mockReturnValue({
      data: {
        html: '<p>content</p>',
        toc: [],
        metadata: { title: 'Fixing gaps', slug: 'fixing-gaps', category: 'compliance' },
        related: [],
        upNext: null,
      },
      isPending: false,
      isError: false,
    });

    render(
      withProviders(
        <>
          <ArticleOpener category="compliance" slug="fixing-gaps" />
          <HelpDocsModal communityId={1} flagEnabled />
        </>,
      ),
    );

    screen.getByText('open article').click();

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByTestId('article-body')).toHaveTextContent('Fixing gaps');
  });

  it('shows an error banner when article fetch fails', async () => {
    useHelpArticleMock.mockReturnValue({
      data: null,
      isPending: false,
      isError: true,
      refetch: vi.fn(),
    });

    render(
      withProviders(
        <>
          <ArticleOpener category="c" slug="s" />
          <HelpDocsModal communityId={1} flagEnabled />
        </>,
      ),
    );

    screen.getByText('open article').click();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/couldn't load this article/i)).toBeInTheDocument();
  });

  /**
   * The Help button opens the page's first article straight away, and a Next
   * button walks the rest of the page's articles in order.
   */
  describe('page articles', () => {
    const PAGE_ARTICLES = [
      { category: 'operations', slug: 'review-requests', title: 'Review requests', description: 'd1' },
      { category: 'operations', slug: 'dispatch-work-orders', title: 'Dispatch work orders', description: 'd2' },
      { category: 'operations', slug: 'close-out', title: 'Close out a request', description: 'd3' },
    ];

    beforeEach(() => {
      useContextualHelpMock.mockReturnValue({ data: PAGE_ARTICLES, isPending: false, isError: false });
      useHelpArticleMock.mockImplementation((category: string | null, slug: string | null) =>
        slug
          ? {
              data: {
                html: '<p>content</p>',
                toc: [],
                metadata: { title: `Article ${slug}`, slug, category },
                related: [],
                upNext: null,
              },
              isPending: false,
              isError: false,
            }
          : { data: null, isPending: false, isError: false },
      );
    });

    async function openHelp() {
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
    }

    it('opens the first article for the page instead of the list', async () => {
      await openHelp();
      await waitFor(() =>
        expect(screen.getByTestId('article-body')).toHaveTextContent('Article review-requests'),
      );
      expect(screen.queryByTestId('search-panel')).not.toBeInTheDocument();
    });

    it('offers the next page article, with its position', async () => {
      await openHelp();
      const next = await screen.findByRole('button', { name: /next: dispatch work orders/i });
      expect(next).toBeInTheDocument();
      expect(screen.getByText('1 of 3')).toBeInTheDocument();
    });

    it('walks every page article with Next, and drops the button on the last one', async () => {
      await openHelp();
      fireEvent.click(await screen.findByRole('button', { name: /next: dispatch work orders/i }));
      await waitFor(() =>
        expect(screen.getByTestId('article-body')).toHaveTextContent('Article dispatch-work-orders'),
      );
      expect(screen.getByText('2 of 3')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /next: close out a request/i }));
      await waitFor(() =>
        expect(screen.getByTestId('article-body')).toHaveTextContent('Article close-out'),
      );
      expect(screen.queryByRole('button', { name: /^next:/i })).not.toBeInTheDocument();
    });

    it('goes back from the first article to the list of page articles', async () => {
      await openHelp();
      await screen.findByTestId('article-body');
      fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
      await waitFor(() => expect(screen.getByTestId('search-panel')).toBeInTheDocument());
      expect(screen.queryByTestId('article-body')).not.toBeInTheDocument();
    });

    it('shows no Next button when the page has a single article', async () => {
      useContextualHelpMock.mockReturnValue({ data: [PAGE_ARTICLES[0]], isPending: false, isError: false });
      await openHelp();
      await screen.findByTestId('article-body');
      expect(screen.queryByRole('button', { name: /^next:/i })).not.toBeInTheDocument();
    });

    it('shows a loading skeleton, not the list, while the page articles load', async () => {
      useContextualHelpMock.mockReturnValue({ data: undefined, isPending: true, isError: false, fetchStatus: 'fetching' });
      await openHelp();
      expect(screen.queryByTestId('search-panel')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Loading help for this page');
    });

    it('lands on the first article once the page articles finish loading', async () => {
      useContextualHelpMock.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        fetchStatus: 'fetching',
      });
      const ui = (
        <>
          <Opener />
          <HelpDocsModal communityId={1} flagEnabled />
        </>
      );
      const { rerender } = render(withProviders(ui));
      screen.getByText('open help').click();
      await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
      useContextualHelpMock.mockReturnValue({
        data: PAGE_ARTICLES,
        isPending: false,
        isError: false,
        fetchStatus: 'idle',
      });
      rerender(withProviders(ui));
      await waitFor(() =>
        expect(screen.getByTestId('article-body')).toHaveTextContent('Article review-requests'),
      );
    });

    it('lands on the first article again after closing and reopening', async () => {
      await openHelp();
      fireEvent.click(await screen.findByRole('button', { name: /next: dispatch work orders/i }));
      await waitFor(() =>
        expect(screen.getByTestId('article-body')).toHaveTextContent('Article dispatch-work-orders'),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      screen.getByText('open help').click();
      await waitFor(() =>
        expect(screen.getByTestId('article-body')).toHaveTextContent('Article review-requests'),
      );
    });

    it('does not wait on a page-article lookup that never runs', async () => {
      // A disabled TanStack query reports isPending with fetchStatus 'idle'.
      useContextualHelpMock.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        fetchStatus: 'idle',
      });
      await openHelp();
      await waitFor(() => expect(screen.getByTestId('search-panel')).toBeInTheDocument());
    });

    it('falls back to the list when the page articles fail to load', async () => {
      useContextualHelpMock.mockReturnValue({ data: undefined, isPending: false, isError: true, fetchStatus: 'idle' });
      await openHelp();
      await waitFor(() => expect(screen.getByTestId('search-panel')).toBeInTheDocument());
    });

    it('keeps a specific article opened by a link, rather than jumping to the first', async () => {
      render(
        withProviders(
          <>
            <ArticleOpener category="operations" slug="close-out" />
            <HelpDocsModal communityId={1} flagEnabled />
          </>,
        ),
      );
      screen.getByText('open article').click();
      await waitFor(() =>
        expect(screen.getByTestId('article-body')).toHaveTextContent('Article close-out'),
      );
    });
  });

  /**
   * The modal used to be a fixed 440×85vh box, so a three-line contextual list
   * floated in a tall empty panel and a long article got no more room on a wide
   * screen. jsdom lays nothing out, so these pin the CLASSES that decide the
   * size: a viewport-relative width, and a maximum height with no fixed one, so
   * the box is as tall as its content up to the cap.
   */
  describe('sizing', () => {
    /**
     * The stub above answers `false` to every query, which is "no viewport at
     * all". `useIsMobile` asks for `(max-width: 767px)` and the Dialog's
     * `useIsDesktop` for `(min-width: 768px)`; this answers like a real screen.
     */
    function reportViewport(kind: 'desktop' | 'phone') {
      (window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (query: string) => ({
          matches: kind === 'phone' ? query.includes('max-width') : query.includes('min-width'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }),
      );
    }

    async function openedDialog() {
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
      return screen.getByRole('dialog');
    }

    it('on desktop, sizes to its content up to a viewport cap and follows the viewport width', async () => {
      reportViewport('desktop');
      const dialog = await openedDialog();
      expect(dialog.className).toMatch(/\bmax-h-\[85dvh\]/);
      expect(dialog.className).not.toMatch(/\bh-\[85vh\]/);
      expect(dialog.className).toMatch(/\bw-\[min\(100vw-2rem,/);
    });

    it('on desktop, can be resized by the reader', async () => {
      reportViewport('desktop');
      const dialog = await openedDialog();
      // The Dialog renders its resize handles only when `resizable` is set AND
      // the viewport is desktop — so this needs both.
      await waitFor(() =>
        expect(dialog.querySelector('[aria-label="Resize dialog"]')).not.toBeNull(),
      );
    });

    it('on desktop, does not clip its edges, so the resize strips reach past the border', async () => {
      // The strips straddle the border so they stay off the body's scrollbar.
      // The Dialog's default `overflow-y-auto` would clip their outer half.
      reportViewport('desktop');
      const dialog = await openedDialog();
      expect(dialog.className).toMatch(/\boverflow-visible\b/);
      expect(dialog.className).not.toMatch(/\boverflow-y-auto\b/);
    });

    it('keeps the header controls clear of the close button in the corner', async () => {
      // The Dialog draws its own X centred 24px in from the top and right edges.
      // The header leaves a 56px right gutter for it and is 48px tall, so the X
      // sits level with the header controls and never on top of one.
      reportViewport('desktop');
      const dialog = await openedDialog();
      const header = dialog.querySelector('[data-help-header]') as HTMLElement;
      expect(header).not.toBeNull();
      expect(header.className).toMatch(/\bpr-14\b/);
      expect(header.className).toMatch(/\bh-12\b/);
    });

    it('on desktop, grows wider on larger screens', async () => {
      reportViewport('desktop');
      const dialog = await openedDialog();
      expect(dialog.className).toMatch(/\blg:w-\[min\(90vw,48rem\)\]/);
      expect(dialog.className).toMatch(/\bxl:w-\[min\(90vw,56rem\)\]/);
    });

    it('on mobile, the bottom sheet is as tall as its content up to a viewport cap', async () => {
      reportViewport('phone');
      const dialog = await openedDialog();
      expect(dialog.className).toMatch(/\bmax-h-\[90dvh\]/);
      expect(dialog.className).not.toMatch(/\bh-\[85vh\]/);
    });
  });
});
