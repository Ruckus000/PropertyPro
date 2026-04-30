'use client';

import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { FinanceDashboard } from '../finance-dashboard';

const financeKpiRowSpy = vi.fn();
const assessmentManagerSpy = vi.fn();
const delinquencyTableSpy = vi.fn();
const ledgerTableSpy = vi.fn();
const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

const routerReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
  usePathname: () => '/communities/3/finance',
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('../finance-kpi-row', () => ({
  FinanceKpiRow: ({ delinquencyEnabled }: { delinquencyEnabled?: boolean }) => {
    financeKpiRowSpy(delinquencyEnabled);
    return <div data-testid="finance-kpi-row" />;
  },
}));

vi.mock('../assessment-manager', () => ({
  AssessmentManager: () => {
    assessmentManagerSpy();
    return <div>Assessments Content</div>;
  },
}));

vi.mock('../delinquency-table', () => ({
  DelinquencyTable: () => {
    delinquencyTableSpy();
    return <div>Delinquency Content</div>;
  },
}));

vi.mock('../ledger-table', () => ({
  LedgerTable: () => {
    ledgerTableSpy();
    return <div>Ledger Content</div>;
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('FinanceDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerReplace.mockReset();
  });

  it('only mounts the default assessments tab on cold entry', () => {
    render(
      <FinanceDashboard communityId={3} userId="user-1" userRole="board_member" />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText('Assessments Content')).toBeTruthy();
    expect(screen.queryByText('Delinquency Content')).toBeNull();
    expect(screen.queryByText('Ledger Content')).toBeNull();
    expect(assessmentManagerSpy).toHaveBeenCalledTimes(1);
    expect(delinquencyTableSpy).not.toHaveBeenCalled();
    expect(ledgerTableSpy).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(financeKpiRowSpy).toHaveBeenLastCalledWith(false);
  });

  it('defers recent payments until the tab is opened', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    render(
      <FinanceDashboard communityId={3} userId="user-1" userRole="board_member" />,
      { wrapper: createWrapper() },
    );

    expect(mockFetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole('tab', { name: 'Recent Payments' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/payments/history?communityId=3',
        undefined,
      );
    });
  });

  it('only enables delinquency KPI data after the delinquency tab is opened', async () => {
    const user = userEvent.setup();
    render(
      <FinanceDashboard communityId={3} userId="user-1" userRole="board_member" />,
      { wrapper: createWrapper() },
    );

    expect(financeKpiRowSpy).toHaveBeenLastCalledWith(false);

    await user.click(screen.getByRole('tab', { name: 'Delinquency' }));

    await waitFor(() => {
      expect(screen.getByText('Delinquency Content')).toBeTruthy();
    });

    expect(delinquencyTableSpy).toHaveBeenCalledTimes(1);
    expect(financeKpiRowSpy).toHaveBeenLastCalledWith(true);
  });

  it('updates the browser URL when changing tabs', async () => {
    const user = userEvent.setup();

    render(
      <FinanceDashboard communityId={3} userId="user-1" userRole="board_member" />,
      { wrapper: createWrapper() },
    );

    await user.click(screen.getByRole('tab', { name: 'Ledger' }));

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith('/communities/3/finance?tab=ledger', { scroll: false });
    });
  });
});
