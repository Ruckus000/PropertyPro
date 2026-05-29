import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PortfolioTable } from '@/components/pm/PortfolioTable';
import type { PortfolioCommunity } from '@/hooks/use-portfolio-dashboard';

// ---------------------------------------------------------------------------
// The "Site" column derives a pill from two raw onboarding signals:
//   - siteOnboardingCompletedAt set        → "Customized"
//   - not completed + has draft blocks     → "Draft saved"
//   - neither                              → "Default"
// Each pill links to the onboarding wizard for that community.
// ---------------------------------------------------------------------------

function makeCommunity(overrides: Partial<PortfolioCommunity>): PortfolioCommunity {
  return {
    communityId: 1,
    communityName: 'Test Community',
    communityType: 'condo_718',
    totalUnits: 10,
    residentCount: 20,
    occupancyRate: null,
    occupiedUnits: null,
    openMaintenanceRequests: 0,
    complianceScore: null,
    outstandingBalance: 0,
    expiringLeases: 0,
    siteOnboardingCompletedAt: null,
    hasUnpublishedSiteDrafts: false,
    ...overrides,
  };
}

const noop = () => {};

function renderTable(data: PortfolioCommunity[]) {
  return render(
    <PortfolioTable
      data={data}
      totalCount={data.length}
      isLoading={false}
      pagination={{ pageIndex: 0, pageSize: 20 }}
      onPaginationChange={noop}
      sorting={[]}
      onSortingChange={noop}
    />,
  );
}

describe('communities-table Site pill', () => {
  it('renders "Customized" when site_onboarding_completed_at is set', () => {
    renderTable([
      makeCommunity({
        communityId: 7,
        communityName: 'Customized HOA',
        siteOnboardingCompletedAt: '2026-05-29T10:00:00.000Z',
        hasUnpublishedSiteDrafts: true, // completion takes precedence over drafts
      }),
    ]);
    expect(screen.getByText('Customized')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /customize the public site for customized hoa/i });
    expect(link).toHaveAttribute('href', '/pm/onboarding/website?communityId=7');
  });

  it('renders "Draft saved" when not completed but draft blocks exist', () => {
    renderTable([
      makeCommunity({
        communityId: 8,
        communityName: 'In Progress Condos',
        siteOnboardingCompletedAt: null,
        hasUnpublishedSiteDrafts: true,
      }),
    ]);
    expect(screen.getByText('Draft saved')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /in progress condos \(draft saved\)/i }),
    ).toHaveAttribute('href', '/pm/onboarding/website?communityId=8');
  });

  it('renders "Default" when neither completed nor drafted', () => {
    renderTable([
      makeCommunity({
        communityId: 9,
        communityName: 'Brand New Apartments',
        siteOnboardingCompletedAt: null,
        hasUnpublishedSiteDrafts: false,
      }),
    ]);
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /brand new apartments \(default\)/i }),
    ).toHaveAttribute('href', '/pm/onboarding/website?communityId=9');
  });

  it('renders distinct pills per row across all three states', () => {
    renderTable([
      makeCommunity({ communityId: 1, communityName: 'A', siteOnboardingCompletedAt: '2026-01-01T00:00:00.000Z' }),
      makeCommunity({ communityId: 2, communityName: 'B', hasUnpublishedSiteDrafts: true }),
      makeCommunity({ communityId: 3, communityName: 'C' }),
    ]);
    const rows = screen.getAllByRole('row');
    // header + 3 body rows
    expect(rows.length).toBe(4);
    expect(within(rows[1]!).getByText('Customized')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Draft saved')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('Default')).toBeInTheDocument();
  });
});
