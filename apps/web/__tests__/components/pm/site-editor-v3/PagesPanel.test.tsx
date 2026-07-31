/**
 * Website editor v3 — the Pages tool panel (Phase 11b-3).
 *
 * Three things this file protects:
 *
 *   1. all four data states render something useful — a panel that renders
 *      nothing while loading or after a failed read reads as a broken editor,
 *      and this is the surface that decides which page every block write lands
 *      on, so "looks empty" is not a survivable state;
 *   2. the row states a PM has to be able to tell apart (a page staged for
 *      removal, one that has never been published, one hidden from the nav) are
 *      each said in WORDS, not only in colour;
 *   3. a selection that no longer names a real page repairs itself to home,
 *      rather than leaving the manager saving into a 404 with no way back.
 *
 * `@/hooks/use-site-pages` is mocked COMPLETELY. A partial factory fails only at
 * module load, and only for whichever component reaches the missing export, so
 * it reads as an unrelated component breaking rather than a mock being short.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { useSitePagesMock, refetchMock } = vi.hoisted(() => ({
  useSitePagesMock: vi.fn(),
  refetchMock: vi.fn(),
}));

vi.mock('@/hooks/use-site-pages', () => ({
  useSitePages: useSitePagesMock,
  useCreateSitePage: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useUpdateSitePage: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useReorderSitePages: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useDeleteSitePage: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useUnstageSitePageDelete: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  applyPageOrder: (pages: unknown) => pages,
  sitePagesKey: (communityId: number) => ['pm', 'site', 'pages', communityId] as const,
}));

import { PagesPanel } from '@/components/pm/site-editor-v3/panels/PagesPanel';
import type { SitePageSummary } from '@/hooks/use-site-pages';

function page(overrides: Partial<SitePageSummary> & { id: number }): SitePageSummary {
  return {
    name: `Page ${overrides.id}`,
    slug: `page-${overrides.id}`,
    inNav: true,
    sortOrder: overrides.id,
    isHome: false,
    isDraft: false,
    publishedAt: '2026-07-01T00:00:00.000Z',
    deleteStagedAt: null,
    ...overrides,
  };
}

const HOME = page({ id: 1, name: 'Home', slug: '', isHome: true, sortOrder: 0 });
const AMENITIES = page({ id: 2, name: 'Amenities', slug: 'amenities' });

const onSelectPage = vi.fn();

function renderPanel({
  pages = [HOME, AMENITIES] as SitePageSummary[] | undefined,
  isPending = false,
  isError = false,
  error = null as Error | null,
  selectedPageId = 1 as number | null,
} = {}) {
  useSitePagesMock.mockReturnValue({
    data: isPending || isError ? undefined : pages,
    isPending,
    isError,
    error,
    refetch: refetchMock,
  });
  return render(
    <PagesPanel communityId={7} selectedPageId={selectedPageId} onSelectPage={onSelectPage} />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('PagesPanel — data states', () => {
  it('renders placeholder rows while the list is in flight', () => {
    renderPanel({ isPending: true });
    expect(screen.getByTestId('site-pages-loading')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Site pages' })).not.toBeInTheDocument();
  });

  it('explains a failed read and offers a retry that refetches', async () => {
    const user = userEvent.setup();
    renderPanel({ isError: true, error: new Error('Network is down') });

    expect(screen.getByText("We couldn't load your pages.")).toBeInTheDocument();
    expect(screen.getByText('Network is down')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('renders an empty state rather than a bare list when there are no pages', () => {
    renderPanel({ pages: [] });
    expect(screen.getByTestId('site-pages-empty')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Site pages' })).not.toBeInTheDocument();
  });

  it('lists the pages with their public addresses', () => {
    renderPanel();

    const rows = within(screen.getByRole('list', { name: 'Site pages' })).getAllByRole(
      'listitem',
    );
    expect(rows).toHaveLength(2);
    // Home keeps the order the server sent — it is pinned at the site root.
    expect(within(rows[0]!).getByText('Home')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('/')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Amenities')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('/amenities')).toBeInTheDocument();
  });
});

describe('PagesPanel — selection', () => {
  it('marks exactly one row as the page being edited', () => {
    renderPanel({ selectedPageId: 2 });

    const current = screen
      .getAllByRole('button')
      .filter((node) => node.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Amenities');
  });

  it('reports a click as a page change', async () => {
    const user = userEvent.setup();
    renderPanel({ selectedPageId: 1 });

    await user.click(screen.getByTestId('site-page-row-2'));
    expect(onSelectPage).toHaveBeenCalledWith(2);
  });

  it('marks no row current until the parent says which page is selected', () => {
    // Controlled, deliberately: the panel renders the selection the block
    // writes actually use, never one of its own.
    renderPanel({ selectedPageId: null });
    expect(
      screen.getAllByRole('button').filter((n) => n.getAttribute('aria-current') === 'true'),
    ).toHaveLength(0);
  });

  it('selects home when the editor arrived with no page at all', () => {
    // The server-side seed failing is the way this happens. Without it the
    // panel shows nothing as current while every save quietly lands on home —
    // true, invisible, and the kind of wrong nobody reports.
    renderPanel({ selectedPageId: null });

    expect(onSelectPage).toHaveBeenCalledTimes(1);
    expect(onSelectPage).toHaveBeenCalledWith(1);
  });

  it('repairs a selection that no longer names a real page, once', () => {
    // Reachable from the next slice (removing the page you were editing) and
    // from a second browser tab. The server answers a write to an unknown page
    // with a 404, so without this the PM is stuck saving into nothing.
    renderPanel({ selectedPageId: 999 });

    expect(onSelectPage).toHaveBeenCalledTimes(1);
    expect(onSelectPage).toHaveBeenCalledWith(1);
  });

  it('leaves a valid selection alone', () => {
    renderPanel({ selectedPageId: 2 });
    expect(onSelectPage).not.toHaveBeenCalled();
  });

  it('does not repair a selection while the list is still loading', () => {
    // `undefined` data means "not known yet", not "not there" — repairing on it
    // would throw away the server-seeded selection on every mount, which is the
    // exact bug the seed exists to prevent.
    renderPanel({ selectedPageId: 999, isPending: true });
    expect(onSelectPage).not.toHaveBeenCalled();
  });

  it('does not invent a selection while the list is still loading', () => {
    renderPanel({ selectedPageId: null, isPending: true });
    expect(onSelectPage).not.toHaveBeenCalled();
  });

  it('does not repair a selection when the read failed', () => {
    renderPanel({ selectedPageId: 999, isError: true, error: new Error('nope') });
    expect(onSelectPage).not.toHaveBeenCalled();
  });
});

describe('PagesPanel — row state', () => {
  it('says a staged removal in words', () => {
    renderPanel({
      pages: [HOME, page({ id: 2, name: 'Amenities', deleteStagedAt: '2026-07-30T00:00:00.000Z' })],
    });
    expect(within(screen.getByTestId('site-page-row-2')).getByText('Removing')).toBeInTheDocument();
  });

  it('says an unpublished page is a draft', () => {
    renderPanel({
      pages: [HOME, page({ id: 2, name: 'Amenities', isDraft: true, publishedAt: null })],
    });
    expect(within(screen.getByTestId('site-page-row-2')).getByText('Draft')).toBeInTheDocument();
  });

  it('says a page kept out of the nav is hidden', () => {
    renderPanel({ pages: [HOME, page({ id: 2, name: 'Amenities', inNav: false })] });
    expect(within(screen.getByTestId('site-page-row-2')).getByText('Hidden')).toBeInTheDocument();
  });

  it('leads with the removal when a page is both staged and hidden', () => {
    // A row is ~280px wide. The state with a deadline attached is the one that
    // has to be said; "Hidden" can wait for the row the PM opens.
    renderPanel({
      pages: [
        HOME,
        page({
          id: 2,
          name: 'Amenities',
          inNav: false,
          isDraft: true,
          deleteStagedAt: '2026-07-30T00:00:00.000Z',
        }),
      ],
    });
    const row = within(screen.getByTestId('site-page-row-2'));
    expect(row.getByText('Removing')).toBeInTheDocument();
    expect(row.queryByText('Hidden')).not.toBeInTheDocument();
    expect(row.queryByText('Draft')).not.toBeInTheDocument();
  });

  it('badges nothing on an ordinary published page', () => {
    renderPanel();
    const row = within(screen.getByTestId('site-page-row-2'));
    expect(row.queryByText('Removing')).not.toBeInTheDocument();
    expect(row.queryByText('Draft')).not.toBeInTheDocument();
    expect(row.queryByText('Hidden')).not.toBeInTheDocument();
  });
});
