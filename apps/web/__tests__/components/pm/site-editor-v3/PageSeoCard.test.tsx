/**
 * "Page by page" (website builder v4, Phase 5b): each sub-page's own search
 * title and description, with the defaults shown as placeholders.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SitePageSummary } from '@/hooks/use-site-pages';

const { pagesRef, mutateMock } = vi.hoisted(() => ({
  pagesRef: { current: [] as SitePageSummary[] },
  mutateMock: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/use-site-pages', () => ({
  useSitePages: () => ({ data: pagesRef.current }),
  useUpdateSitePage: () => ({ mutate: mutateMock, isPending: false }),
}));

import { PageSeoCard } from '@/components/pm/site-editor-v3/settings/PageSeoCard';

function page(overrides: Partial<SitePageSummary> & { id: number; name: string }): SitePageSummary {
  return {
    slug: overrides.name.toLowerCase(),
    inNav: true,
    sortOrder: overrides.id,
    isHome: false,
    isDraft: false,
    publishedAt: '2026-07-01T00:00:00.000Z',
    deleteStagedAt: null,
    seoTitle: null,
    seoDescription: null,
    ...overrides,
  };
}

const HOME = page({ id: 1, name: 'Home', isHome: true, slug: '' });

function renderCard() {
  return render(
    <PageSeoCard communityId={42} communityName="Sunset Condos" siteDescription="The site's own words." />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('PageSeoCard', () => {
  it('leaves the home page out, and says so when it is the only page', () => {
    pagesRef.current = [HOME];
    renderCard();
    expect(screen.getByTestId('page-seo-empty')).toBeInTheDocument();
    expect(screen.queryByLabelText('Page')).not.toBeInTheDocument();
  });

  it('shows the defaults as placeholders', () => {
    pagesRef.current = [HOME, page({ id: 2, name: 'About' })];
    renderCard();
    expect(screen.queryByRole('option', { name: 'Home' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveAttribute('placeholder', 'About · Sunset Condos');
    expect(screen.getByLabelText('Description')).toHaveAttribute('placeholder', "The site's own words.");
  });

  it('saves the selected page, with blanks sent as null to restore the default', async () => {
    const user = userEvent.setup();
    pagesRef.current = [HOME, page({ id: 2, name: 'About' }), page({ id: 3, name: 'Rules' })];
    renderCard();

    await user.selectOptions(screen.getByLabelText('Page'), '3');
    await user.type(screen.getByLabelText('Title'), 'Pool and parking rules');
    await user.click(screen.getByRole('button', { name: 'Save page settings' }));

    expect(mutateMock).toHaveBeenCalledWith(
      { pageId: 3, seoTitle: 'Pool and parking rules', seoDescription: null },
      expect.anything(),
    );
  });

  it('clearing a stored title sends null, so the page goes back to its default', async () => {
    const user = userEvent.setup();
    pagesRef.current = [HOME, page({ id: 2, name: 'About', seoTitle: 'About us' })];
    renderCard();

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), '   ');
    await user.click(screen.getByRole('button', { name: 'Save page settings' }));

    expect(mutateMock).toHaveBeenCalledWith(
      { pageId: 2, seoTitle: null, seoDescription: null },
      expect.anything(),
    );
  });

  it("starts from each page's stored values when switching pages", async () => {
    const user = userEvent.setup();
    pagesRef.current = [
      HOME,
      page({ id: 2, name: 'About', seoTitle: 'About us' }),
      page({ id: 3, name: 'Rules', seoDescription: 'All the rules.' }),
    ];
    renderCard();
    expect(screen.getByLabelText('Title')).toHaveValue('About us');

    await user.selectOptions(screen.getByLabelText('Page'), '3');
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('Description')).toHaveValue('All the rules.');
  });

  it('counts in code points and blocks save over the limit', async () => {
    const user = userEvent.setup();
    pagesRef.current = [HOME, page({ id: 2, name: 'About' })];
    renderCard();
    await user.type(screen.getByLabelText('Title'), '🌀'.repeat(61));
    expect(screen.getByText('61/60')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save page settings' })).toBeDisabled();
  });

  it('counts what the server stores, so stray spaces do not block a save', async () => {
    // The server collapses whitespace runs and trims before its cap.
    // Revert check: the normalisation in `count`.
    const user = userEvent.setup();
    pagesRef.current = [HOME, page({ id: 2, name: 'About' })];
    renderCard();
    await user.type(screen.getByLabelText('Title'), `  ${'a'.repeat(29)}  ${'b'.repeat(29)}  `);
    expect(screen.getByText('59/60')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save page settings' })).toBeEnabled();
  });
});
