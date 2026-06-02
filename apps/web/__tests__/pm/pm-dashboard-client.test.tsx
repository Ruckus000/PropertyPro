/**
 * PmDashboardClient Component Tests (B5 batch 20 drain of PmDashboardClient.tsx).
 *
 * Verifies the consumer wiring of the drained useBillingGroup hook:
 * - "Add Community" button disabled state keyed off billingGroupId
 * - warning AlertBanner rendered + error message shown when the hook errors
 *
 * The hooks and any fetching children are mocked so the test stays a pure
 * component-wiring assertion.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mockUseBillingGroup = vi.fn();
const mockUsePortfolioDashboard = vi.fn();

vi.mock('@/hooks/use-billing-group', () => ({
  useBillingGroup: () => mockUseBillingGroup(),
}));

vi.mock('@/hooks/use-portfolio-dashboard', () => ({
  usePortfolioDashboard: () => mockUsePortfolioDashboard(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

// Children that fetch / carry their own data deps are stubbed so the render
// is a pure wiring assertion.
vi.mock('@/components/pm/add-community-modal', () => ({
  AddCommunityModal: () => null,
}));
vi.mock('@/components/pm/CommunityAddedModal', () => ({
  CommunityAddedModal: () => null,
}));
vi.mock('@/components/pm/SiteSetupBanner', () => ({
  SiteSetupBanner: () => null,
}));
vi.mock('@/components/pm/CommunityFilters', () => ({
  CommunityFilters: () => null,
}));
vi.mock('@/components/pm/CommunityCardGrid', () => ({
  CommunityCardGrid: () => null,
}));
vi.mock('@/components/pm/PortfolioTable', () => ({
  PortfolioTable: () => null,
}));
vi.mock('@/components/pm/KpiSummaryBar', () => ({
  KpiSummaryBar: () => null,
}));

import { PmDashboardClient } from '@/components/pm/PmDashboardClient';

function renderClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return render(<PmDashboardClient />, { wrapper: Wrapper });
}

describe('PmDashboardClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePortfolioDashboard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
  });

  it('disables "Add Community" when useBillingGroup has no data', () => {
    mockUseBillingGroup.mockReturnValue({ data: undefined, isError: false });

    renderClient();

    const button = screen.getByRole('button', { name: /add community/i });
    expect(button).toBeDisabled();
  });

  it('enables "Add Community" once a billingGroupId is present', () => {
    mockUseBillingGroup.mockReturnValue({
      data: { data: { billingGroupId: 7 } },
      isError: false,
    });

    renderClient();

    const button = screen.getByRole('button', { name: /add community/i });
    expect(button).toBeEnabled();
  });

  it('renders the billing warning banner with the error message on error', () => {
    mockUseBillingGroup.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error('boom'),
    });

    renderClient();

    expect(
      screen.getByText('Portfolio billing needs attention'),
    ).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });
});
