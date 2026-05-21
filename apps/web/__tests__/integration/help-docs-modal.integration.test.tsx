/**
 * Integration tests for the HelpDocsModal end-to-end behavior.
 *
 * Imports the REAL HelpDeepLinkHandler from src/components/help — not a
 * local reimplementation — so any drift between the test scenario and
 * the production handler surfaces immediately.
 *
 * Scope:
 * - ? keyboard shortcut opens modal
 * - ? keyboard shortcut is SUPPRESSED inside input fields
 * - Esc closes modal
 * - ?help=cat/slug query param opens modal to that article
 * - ?help= is stripped from URL when modal closes
 * - flagEnabled=false renders nothing
 *
 * Mocks the API layer (useHelpArticle, useContextualHelp, useFeaturedArticles)
 * to avoid needing a real backend.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useContextualHelpMock = vi.fn();
const useHelpArticleMock = vi.fn();
const useFeaturedArticlesMock = vi.fn();
const useSearchParamsMock = vi.fn();
const usePathnameMock = vi.fn();
const routerReplaceMock = vi.fn();

vi.mock('../../src/hooks/use-help', async () => {
  const actual = await vi.importActual<typeof import('../../src/hooks/use-help')>(
    '../../src/hooks/use-help',
  );
  return {
    ...actual,
    useContextualHelp: (...args: unknown[]) => useContextualHelpMock(...args),
    useHelpArticle: (...args: unknown[]) => useHelpArticleMock(...args),
    useFeaturedArticles: (...args: unknown[]) => useFeaturedArticlesMock(...args),
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
  useSearchParams: () => useSearchParamsMock(),
  useRouter: () => ({ replace: routerReplaceMock }),
}));

vi.mock('../../src/components/help/help-article-body', () => ({
  HelpArticleBody: ({ metadata }: { metadata: { title: string } }) => (
    <div data-testid="article-body">{metadata.title}</div>
  ),
}));

vi.mock('../../src/components/help/help-docs-modal-search-panel', () => ({
  HelpDocsModalSearchPanel: () => <div data-testid="search-panel" />,
}));

import { HelpWidgetProvider } from '../../src/components/help/help-widget-provider';
import { HelpDocsModal } from '../../src/components/help/help-docs-modal';
import { HelpDeepLinkHandler } from '../../src/components/help/help-deep-link-handler';

function harness(flagEnabled = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <HelpWidgetProvider>
        <HelpDeepLinkHandler />
        <HelpDocsModal communityId={1} flagEnabled={flagEnabled} />
      </HelpWidgetProvider>
    </QueryClientProvider>,
  );
}

const articleData = {
  source: { compiledSource: 'x', frontmatter: {}, scope: {} },
  toc: [],
  metadata: { title: 'Welcome', slug: 'welcome', category: 'getting-started' },
  related: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue('/dashboard');
  useSearchParamsMock.mockReturnValue(new URLSearchParams());
  useContextualHelpMock.mockReturnValue({ data: [], isFetching: false });
  useHelpArticleMock.mockReturnValue({ data: null, isLoading: false, isError: false });
  useFeaturedArticlesMock.mockReturnValue({ data: [] });

  // matchMedia mock:
  // - (pointer: fine) returns matches: true so HelpWidgetProvider registers the ? shortcut
  // - (max-width: 767px) returns matches: false so we get a Dialog (desktop), not a Sheet
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(pointer: fine)',
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

describe('HelpDocsModal integration', () => {
  it('opens via ? keyboard shortcut and closes via Esc', async () => {
    harness();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(document, { key: '?' });
    });

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('suppresses the ? shortcut when focus is inside an input', async () => {
    harness();

    // Render an input outside the modal that captures focus.
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => {
      fireEvent.keyDown(input, { key: '?' });
    });

    // Give React a tick to settle — if the modal opens, the assertion below
    // will catch it.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    document.body.removeChild(input);
  });

  it('opens to a specific article when ?help=cat/slug is set', async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('help=getting-started/welcome'));
    useHelpArticleMock.mockReturnValue({
      data: articleData,
      isLoading: false,
      isError: false,
    });

    harness();

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByTestId('article-body')).toHaveTextContent('Welcome');
  });

  it('strips ?help= from the URL when the modal closes', async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('help=getting-started/welcome'));
    useHelpArticleMock.mockReturnValue({
      data: articleData,
      isLoading: false,
      isError: false,
    });

    harness();

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    await waitFor(() =>
      expect(routerReplaceMock).toHaveBeenCalledWith('/dashboard', { scroll: false }),
    );
  });

  it('renders null when flagEnabled=false', () => {
    harness(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
