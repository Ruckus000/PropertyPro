/**
 * The seam between `PmDashboardClient` and `SiteSetupBanner`.
 *
 * `site-setup-banner.test.tsx` renders `<SiteSetupBanner hasIncompleteSite />`
 * directly, so it proves the banner works when told to render — and proves
 * nothing about whether anything ever tells it to. That gap is why a report of
 * "the banner never appears on /pm/dashboard/communities" could not be settled
 * from the existing suite.
 *
 * These tests drive the real `PmDashboardClient` with a mocked dashboard query
 * and assert on the wiring: the predicate that decides `hasIncompleteSite`, and
 * the community id it deep-links to.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { usePortfolioDashboardMock, dismissedRef } = vi.hoisted(() => ({
  usePortfolioDashboardMock: vi.fn(),
  dismissedRef: { current: false as boolean | undefined, loading: false },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/pm/dashboard/communities',
}));

vi.mock('@/hooks/use-portfolio-dashboard', () => ({
  usePortfolioDashboard: usePortfolioDashboardMock,
  PORTFOLIO_KEYS: { all: ['pm', 'dashboard'], summary: () => ['pm', 'dashboard', 'summary'] },
}));

vi.mock('@/hooks/use-billing-group', () => ({
  useBillingGroup: () => ({ data: { data: { billingGroupId: 1 } }, isError: false, error: null }),
}));

// The banner's own dismissal state — held not-dismissed so the wiring under
// test is the only thing that can hide it.
vi.mock('@/hooks/use-site-setup-banner', () => ({
  useSiteSetupBannerDismissed: () => ({
    data: dismissedRef.current,
    isLoading: dismissedRef.loading,
  }),
  useDismissSiteSetupBanner: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Heavy children stubbed: this file is about the banner seam, not the table.
vi.mock('@/components/pm/CommunityFilters', () => ({ CommunityFilters: () => null }));
vi.mock('@/components/pm/KpiSummaryBar', () => ({ KpiSummaryBar: () => null }));
vi.mock('@/components/pm/CommunityCardGrid', () => ({ CommunityCardGrid: () => null }));
vi.mock('@/components/pm/PortfolioTable', () => ({ PortfolioTable: () => null }));
vi.mock('@/components/pm/add-community-modal', () => ({ AddCommunityModal: () => null }));
vi.mock('@/components/pm/CommunityAddedModal', () => ({ CommunityAddedModal: () => null }));
vi.mock('@/components/pm/BulkAnnouncementDialog', () => ({ BulkAnnouncementDialog: () => null }));
vi.mock('@/components/pm/BulkDocumentDialog', () => ({ BulkDocumentDialog: () => null }));
vi.mock('@/components/pm/ViewToggle', () => ({
  ViewToggle: () => null,
  getStoredViewMode: () => 'cards',
  storeViewMode: vi.fn(),
}));

import { PmDashboardClient } from '@/components/pm/PmDashboardClient';

function community(id: number, siteOnboardingCompletedAt: string | null) {
  return {
    communityId: id,
    communityName: `Community ${id}`,
    communityType: 'condo_718' as const,
    totalUnits: 10,
    residentCount: 5,
    occupancyRate: 1,
    occupiedUnits: 10,
    openMaintenanceRequests: 0,
    complianceScore: 100,
    outstandingBalance: 0,
    expiringLeases: 0,
    siteOnboardingCompletedAt,
    hasUnpublishedSiteDrafts: false,
  };
}

function mockDashboard(communities: ReturnType<typeof community>[], isLoading = false) {
  usePortfolioDashboardMock.mockReturnValue({
    data: isLoading ? undefined : { kpis: {}, communities, totalCount: communities.length },
    isLoading,
    isError: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  dismissedRef.current = false;
  dismissedRef.loading = false;
});

describe('PmDashboardClient → SiteSetupBanner wiring', () => {
  it('shows the banner when a loaded community has not completed site onboarding', () => {
    mockDashboard([community(1, null)]);
    render(<PmDashboardClient />);
    expect(screen.getByTestId('site-setup-banner')).toBeInTheDocument();
  });

  it('deep-links the CTA at the FIRST incomplete community', () => {
    mockDashboard([
      community(7, '2026-01-01T00:00:00.000Z'),
      community(9, null),
      community(11, null),
    ]);
    render(<PmDashboardClient />);
    expect(screen.getByTestId('site-setup-banner-cta')).toHaveAttribute(
      'href',
      '/pm/onboarding/website?communityId=9',
    );
  });

  it('hides the banner when every community has completed onboarding', () => {
    mockDashboard([community(1, '2026-01-01T00:00:00.000Z')]);
    render(<PmDashboardClient />);
    expect(screen.queryByTestId('site-setup-banner')).toBeNull();
  });

  it('hides the banner while the dashboard query is still loading', () => {
    // The server render always lands here — React Query has no data on the
    // server — so the banner is necessarily absent from the SSR HTML and only
    // appears after hydration. A report of "it never renders" is expected
    // behaviour if the page never hydrates.
    mockDashboard([], true);
    render(<PmDashboardClient />);
    expect(screen.queryByTestId('site-setup-banner')).toBeNull();
  });
});
