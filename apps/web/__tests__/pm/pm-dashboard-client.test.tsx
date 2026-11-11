/**
 * The Communities page, driven through the real `PmDashboardClient` and its
 * real children with the data hooks mocked.
 *
 * Covers: the layout each portfolio size gets, the remembered cards/list
 * choice, bulk selection, the saved views and filters (which live in the
 * URL), the empty / loading / error states, and the Add Community button's
 * billing gate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PortfolioCommunity, PortfolioFilters } from '@/hooks/use-portfolio-dashboard';

const h = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
  push: vi.fn(),
  dashboard: vi.fn(),
  billing: vi.fn(),
  lastFilters: null as unknown,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => h.params,
  useRouter: () => ({ push: h.push, replace: h.replace }),
  usePathname: () => '/pm/dashboard/communities',
}));

vi.mock('@/hooks/use-portfolio-dashboard', () => ({
  usePortfolioDashboard: (filters: unknown) => {
    h.lastFilters = filters;
    return h.dashboard();
  },
}));

vi.mock('@/hooks/use-billing-group', () => ({
  useBillingGroup: () => h.billing(),
}));

vi.mock('@/components/pm/add-community-modal', () => ({
  AddCommunityModal: ({ open }: { open: boolean }) => (open ? <div role="dialog">Add a community</div> : null),
}));
vi.mock('@/components/pm/CommunityAddedModal', () => ({ CommunityAddedModal: () => null }));
vi.mock('@/components/pm/SiteSetupBanner', () => ({ SiteSetupBanner: () => null }));
vi.mock('@/components/pm/BulkAnnouncementDialog', () => ({
  BulkAnnouncementDialog: ({ open, selectedCommunities }: { open: boolean; selectedCommunities: { name: string }[] }) =>
    open ? <div role="dialog">Announcement to {selectedCommunities.map((c) => c.name).join(', ')}</div> : null,
}));
vi.mock('@/components/pm/BulkDocumentDialog', () => ({ BulkDocumentDialog: () => null }));

import { PmDashboardClient } from '@/components/pm/PmDashboardClient';

function community(id: number, o: Partial<PortfolioCommunity> = {}): PortfolioCommunity {
  return {
    communityId: id,
    communityName: `Community ${String(id).padStart(2, '0')}`,
    communityType: 'condo_718',
    totalUnits: 50,
    residentCount: 40,
    occupancyRate: null,
    occupiedUnits: null,
    openMaintenanceRequests: 0,
    complianceScore: 90,
    outstandingBalance: 0,
    expiringLeases: 0,
    siteOnboardingCompletedAt: '2026-01-01T00:00:00.000Z',
    sitePublishedAt: '2026-01-01T00:00:00.000Z',
    hasUnpublishedSiteDrafts: false,
    slug: `community-${id}`,
    pastDeadlineCount: 0,
    overdueDuesCents: 0,
    status: 'on_track',
    brandColor: null,
    ...o,
  };
}

function portfolio(n: number, make: (i: number) => Partial<PortfolioCommunity> = () => ({})) {
  return Array.from({ length: n }, (_, i) => community(i + 1, make(i + 1)));
}

function serve(rows: PortfolioCommunity[], extra: { portfolioCount?: number; totalCount?: number } = {}) {
  const refetch = vi.fn();
  h.dashboard.mockReturnValue({
    data: {
      kpis: { totalUnits: { label: 'Total Units', value: rows.reduce((a, r) => a + r.totalUnits, 0) } },
      communities: rows,
      totalCount: extra.totalCount ?? rows.length,
      portfolioCount: extra.portfolioCount ?? rows.length,
      viewCounts: {
        all: extra.portfolioCount ?? rows.length,
        needsAttention: rows.filter((r) => r.status === 'needs_attention').length,
        overdueDues: rows.filter((r) => (r.overdueDuesCents ?? 0) > 0).length,
      },
    },
    isLoading: false,
    isError: false,
    refetch,
  });
  return refetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.params = new URLSearchParams();
  window.localStorage.clear();
  h.billing.mockReturnValue({ data: { data: { billingGroupId: 7 } }, isError: false });
});

afterEach(cleanup);

describe('layout by portfolio size', () => {
  it('two communities: a chooser card each, with the dashboard and the website', () => {
    serve(portfolio(2, (i) => (i === 2 ? { communityType: 'apartment', status: 'not_tracked', complianceScore: null } : {})));
    render(<PmDashboardClient />);

    expect(screen.getByText('2', { selector: 'span' }).parentElement).toHaveTextContent('2 communities');
    expect(screen.getByRole('link', { name: 'Open dashboard for Community 01' })).toHaveAttribute(
      'href',
      '/pm/dashboard/1',
    );
    expect(screen.getByRole('link', { name: 'Website for Community 02' })).toHaveAttribute(
      'href',
      '/pm/website?communityId=2',
    );
    expect(screen.getByText("No posting rules for apartments, and rent isn't counted here")).toBeInTheDocument();
    // Nothing to filter at two: no saved views, no type filter.
    expect(screen.queryByRole('button', { name: /needs attention/i })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Community type' })).toBeNull();
  });

  it('five communities: a gallery with the views, type and sort, and an Add Community tile', () => {
    serve(portfolio(5, (i) => (i === 3 ? { status: 'needs_attention', pastDeadlineCount: 3 } : {})));
    render(<PmDashboardClient />);

    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '5 communities · 250 units'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Community 03/ })).toHaveAttribute('href', '/pm/dashboard/3');
    expect(screen.getByText('3 documents past deadline', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Needs attention/ })).toHaveTextContent('1');
    expect(screen.getByRole('combobox', { name: 'Community type' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sort communities' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Set up a new association/ })).toBeEnabled();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('fourteen communities: a list grouped by status, with search', () => {
    serve(
      portfolio(14, (i) =>
        i <= 2
          ? { status: 'needs_attention', pastDeadlineCount: 1 }
          : i <= 11
            ? {}
            : { communityType: 'apartment', status: 'not_tracked', complianceScore: null, overdueDuesCents: null },
      ),
    );
    render(<PmDashboardClient />);

    const table = screen.getByRole('table');
    expect(within(table).getByRole('button', { name: /^Needs attention/ })).toHaveAttribute('aria-expanded', 'true');
    expect(within(table).getByRole('button', { name: /^On track/ })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: /^Not tracked/ })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search communities' })).toBeInTheDocument();
  });

  it('folds a long group behind "Show N more" and unfolds it', async () => {
    serve(portfolio(14));
    render(<PmDashboardClient />);

    expect(screen.queryByRole('link', { name: 'Community 14' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show 9 more on track' }));
    expect(screen.getByRole('link', { name: 'Community 14' })).toBeInTheDocument();
  });

  it('thirty communities: a dense table that sorts from its headers and adds up', async () => {
    serve(portfolio(30));
    render(<PmDashboardClient />);

    expect(screen.getByRole('rowheader', { name: /Total 30 · 1,500 units/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Compliance' }));
    expect(h.lastFilters).toMatchObject({ sortBy: 'complianceScore', sortDir: 'asc' } satisfies PortfolioFilters);
    expect(screen.getByRole('columnheader', { name: /Compliance/ })).toHaveAttribute('aria-sort', 'ascending');
  });
});

describe('sort and paging', () => {
  it('a column sort does not follow into cards, where the Sort menu could not show it', async () => {
    serve(portfolio(30));
    render(<PmDashboardClient />);

    await userEvent.click(screen.getByRole('button', { name: 'Compliance' }));
    expect(h.lastFilters).toMatchObject({ sortBy: 'complianceScore' });
    await userEvent.click(screen.getByRole('radio', { name: 'Card view' }));
    expect(h.lastFilters).toMatchObject({ sortBy: 'status', sortDir: 'asc' });
    expect(screen.getByRole('combobox', { name: 'Sort communities' })).toHaveValue('attention');
  });

  it('goes back to the first page in the same request as a new sort', async () => {
    serve(portfolio(100), { totalCount: 150, portfolioCount: 150 });
    render(<PmDashboardClient />);

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(h.lastFilters).toMatchObject({ offset: 100 });
    await userEvent.click(screen.getByRole('button', { name: 'Requests' }));
    expect(h.lastFilters).toMatchObject({ sortBy: 'openMaintenanceRequests', offset: 0 });
  });
});

describe('cards or list', () => {
  it('keeps the choice the user made over the default', async () => {
    window.localStorage.setItem('propertypro.pm.viewMode', 'list');
    serve(portfolio(3));
    render(<PmDashboardClient />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Card view' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(window.localStorage.getItem('propertypro.pm.viewMode')).toBe('cards');
  });

  it('a phone starts select mode from the More menu, which switches to the list', async () => {
    serve(portfolio(3));
    render(<PmDashboardClient />);

    await userEvent.click(screen.getByRole('button', { name: 'More portfolio tools' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Select communities' }));

    const box = screen.getByRole('checkbox', { name: 'Select Community 01' });
    // Below md the checkbox column shows only in select mode.
    expect(box.closest('td')).toHaveClass('table-cell');
    expect(box.closest('td')).not.toHaveClass('hidden');
  });
});

describe('bulk send', () => {
  it('collects the selected communities into the bar and the announcement', async () => {
    serve(portfolio(10));
    render(<PmDashboardClient />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Community 02' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Community 04' }));

    const bar = screen.getByRole('region', { name: 'Bulk actions' });
    expect(bar).toHaveTextContent('2 selected');
    await userEvent.click(within(bar).getByRole('button', { name: 'Send announcement' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Announcement to Community 02, Community 04');
  });

  it('starts the selection over when the search changes, so a send never reaches hidden rows', async () => {
    serve(portfolio(10));
    const { rerender } = render(<PmDashboardClient />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Community 02' }));
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('1 selected');

    h.params = new URLSearchParams('search=community 03');
    serve([community(3)], { portfolioCount: 10 });
    rerender(<PmDashboardClient />);
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).toBeNull();
  });

  it('clears the selection and hides the bar', async () => {
    serve(portfolio(10));
    render(<PmDashboardClient />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all communities shown' }));
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('10 selected');
    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).toBeNull();
  });
});

describe('views and filters', () => {
  it('a saved view goes into the URL', async () => {
    serve(portfolio(5, (i) => (i === 1 ? { status: 'needs_attention', pastDeadlineCount: 2 } : {})));
    render(<PmDashboardClient />);

    await userEvent.click(screen.getByRole('button', { name: /Needs attention/ }));
    expect(h.replace).toHaveBeenCalledWith('/pm/dashboard/communities?view=needs_attention', { scroll: false });
  });

  it('shows "Has overdue dues" only when a community has them', () => {
    serve(portfolio(5));
    const { unmount } = render(<PmDashboardClient />);
    expect(screen.queryByRole('button', { name: /Has overdue dues/ })).toBeNull();
    unmount();

    serve(portfolio(5, (i) => (i === 1 ? { status: 'needs_attention', overdueDuesCents: 5000 } : {})));
    render(<PmDashboardClient />);
    expect(screen.getByRole('button', { name: /Has overdue dues/ })).toBeInTheDocument();
  });

  it('passes the URL filters to the summary', () => {
    h.params = new URLSearchParams('communityType=hoa_720&search=palm&view=overdue_dues');
    serve(portfolio(5));
    render(<PmDashboardClient />);

    expect(h.lastFilters).toMatchObject({ communityType: 'hoa_720', search: 'palm', view: 'overdue_dues' });
  });

  it('ignores a view or type the page does not know', () => {
    h.params = new URLSearchParams('communityType=castle&view=everything');
    serve(portfolio(5));
    render(<PmDashboardClient />);

    expect(h.lastFilters).toMatchObject({ communityType: undefined, view: undefined });
  });
});

describe('empty, loading and error', () => {
  it('a search that matches nothing says so and offers to clear it', async () => {
    h.params = new URLSearchParams('search=harbour&communityType=hoa_720');
    serve([], { portfolioCount: 14 });
    render(<PmDashboardClient />);

    expect(screen.getByText('No communities match "harbour"')).toBeInTheDocument();
    expect(screen.getByText('Check the spelling, or clear the search and the HOA filter to see all 14.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    expect(h.replace).toHaveBeenCalledWith('/pm/dashboard/communities', { scroll: false });
  });

  it('"Clear search and filters" also clears a saved view that would keep it empty', async () => {
    h.params = new URLSearchParams('search=harbour&view=needs_attention');
    serve([], { portfolioCount: 14 });
    render(<PmDashboardClient />);

    await userEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    expect(h.replace).toHaveBeenCalledWith('/pm/dashboard/communities', { scroll: false });
  });

  it('an empty Needs attention view is good news, with a way back', async () => {
    h.params = new URLSearchParams('view=needs_attention');
    serve([], { portfolioCount: 14 });
    render(<PmDashboardClient />);

    expect(screen.getByText('Nothing needs attention')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all communities' }));
    expect(h.replace).toHaveBeenCalledWith('/pm/dashboard/communities', { scroll: false });
  });

  it('shows a loading status before the first answer', () => {
    h.dashboard.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    render(<PmDashboardClient />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading communities');
  });

  it('says what failed and retries', async () => {
    const refetch = vi.fn();
    h.dashboard.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<PmDashboardClient />);

    expect(screen.getByText("We couldn't load your communities.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('site state', () => {
  it('tags unpublished edits, and only those', () => {
    serve(portfolio(3, (i) => ({ hasUnpublishedSiteDrafts: i === 2 })));
    render(<PmDashboardClient />);

    const tags = screen.getAllByText('Unpublished edits');
    expect(tags).toHaveLength(1);
    expect(tags[0]!.closest('a')).toHaveAttribute('href', '/pm/dashboard/2');
  });
});

describe('Add Community', () => {
  it('is disabled until the billing group is known', () => {
    h.billing.mockReturnValue({ data: undefined, isError: false });
    serve(portfolio(2));
    render(<PmDashboardClient />);

    expect(screen.getByRole('button', { name: 'Add Community' })).toBeDisabled();
  });

  it('opens the form once the billing group is known', async () => {
    serve(portfolio(2));
    render(<PmDashboardClient />);

    await userEvent.click(screen.getByRole('button', { name: 'Add Community' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Add a community');
  });

  it('shows the billing warning with its message', () => {
    h.billing.mockReturnValue({ data: undefined, isError: true, error: new Error('boom') });
    serve(portfolio(2));
    render(<PmDashboardClient />);

    expect(screen.getByText('Portfolio billing needs attention')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });
});
