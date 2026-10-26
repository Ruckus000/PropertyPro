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

    it('on mobile, the bottom sheet is as tall as its content up to a viewport cap', async () => {
      reportViewport('phone');
      const dialog = await openedDialog();
      expect(dialog.className).toMatch(/\bmax-h-\[90dvh\]/);
      expect(dialog.className).not.toMatch(/\bh-\[85vh\]/);
    });
  });
});
