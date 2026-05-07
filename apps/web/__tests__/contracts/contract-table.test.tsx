/**
 * Unit tests for ContractTableContainer / ContractTable (P3-52).
 *
 * Post-B5 split: the container owns data fetching via `useContracts`, and the
 * presenter (`ContractTable`) is pure-prop. These tests mock `useContracts`
 * and render the container — that's the surface the page imports and the
 * useful integration boundary.
 *
 * Tests cover:
 * - Loading state (passes through `query.isLoading`)
 * - Empty state
 * - Contract rows (title / vendor / value)
 * - Sealed-bid embargo indicator
 * - Conflict-of-interest badge
 * - Expiration alerts banner
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ContractRecord, ExpirationAlert } from '../../src/components/contracts/types';

const useContractsMock = vi.fn();
const invalidateMock = vi.fn();

vi.mock('@/hooks/use-contracts', () => ({
  useContracts: (opts: unknown) => useContractsMock(opts),
  useContractsInvalidator: () => invalidateMock,
}));

import { ContractTableContainer } from '../../src/components/contracts/contract-table-container';

interface QueryShape {
  data?: { contracts: ContractRecord[]; alerts: ExpirationAlert[] };
  error: Error | null;
  isLoading: boolean;
}

function setQueryState(state: QueryShape) {
  useContractsMock.mockReturnValue(state);
}

function renderContainer(communityId = 42) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ContractTableContainer communityId={communityId} />
    </QueryClientProvider>,
  );
}

describe('ContractTableContainer', () => {
  beforeEach(() => {
    useContractsMock.mockReset();
    invalidateMock.mockReset();
  });

  it('shows loading state', () => {
    setQueryState({ isLoading: true, error: null });
    renderContainer();
    expect(screen.getByText('Loading contracts...')).toBeDefined();
  });

  it('renders empty state when no contracts', () => {
    setQueryState({ isLoading: false, error: null, data: { contracts: [], alerts: [] } });
    renderContainer();
    expect(screen.getByText('No contracts found. Create one to get started.')).toBeDefined();
  });

  it('renders contract rows', () => {
    setQueryState({
      isLoading: false,
      error: null,
      data: {
        contracts: [
          {
            id: 1,
            title: 'Roof Maintenance',
            vendorName: 'RoofCo',
            description: null,
            contractValue: '50000.00',
            startDate: '2026-01-01',
            endDate: '2027-01-01',
            documentId: null,
            complianceChecklistItemId: null,
            biddingClosesAt: null,
            status: 'active',
            conflictOfInterest: false,
            bidSummary: { bids: [], embargoed: false, bidCount: 0, biddingClosesAt: null },
          },
        ],
        alerts: [],
      },
    });

    renderContainer();
    expect(screen.getByText('Roof Maintenance')).toBeDefined();
    expect(screen.getByText('RoofCo')).toBeDefined();
    expect(screen.getByText('$50000.00')).toBeDefined();
  });

  it('shows embargo indicator for sealed bids', () => {
    setQueryState({
      isLoading: false,
      error: null,
      data: {
        contracts: [
          {
            id: 1,
            title: 'Sealed Contract',
            vendorName: 'Vendor',
            description: null,
            contractValue: null,
            startDate: '2026-01-01',
            endDate: null,
            documentId: null,
            complianceChecklistItemId: null,
            biddingClosesAt: '2026-12-31T00:00:00Z',
            status: 'active',
            conflictOfInterest: false,
            bidSummary: {
              bids: [],
              embargoed: true,
              bidCount: 3,
              biddingClosesAt: '2026-12-31T00:00:00Z',
            },
          },
        ],
        alerts: [],
      },
    });

    renderContainer();
    expect(screen.getByText('3 sealed')).toBeDefined();
  });

  it('shows conflict of interest badge', () => {
    setQueryState({
      isLoading: false,
      error: null,
      data: {
        contracts: [
          {
            id: 1,
            title: 'COI Contract',
            vendorName: 'Vendor',
            description: null,
            contractValue: null,
            startDate: '2026-01-01',
            endDate: null,
            documentId: null,
            complianceChecklistItemId: null,
            biddingClosesAt: null,
            status: 'active',
            conflictOfInterest: true,
            bidSummary: { bids: [], embargoed: false, bidCount: 0, biddingClosesAt: null },
          },
        ],
        alerts: [],
      },
    });

    renderContainer();
    expect(screen.getByText('COI Declared')).toBeDefined();
  });

  it('shows expiration alerts banner', () => {
    setQueryState({
      isLoading: false,
      error: null,
      data: {
        contracts: [
          {
            id: 1,
            title: 'Expiring Soon',
            vendorName: 'Vendor',
            description: null,
            contractValue: null,
            startDate: '2026-01-01',
            endDate: '2026-03-15',
            documentId: null,
            complianceChecklistItemId: null,
            biddingClosesAt: null,
            status: 'active',
            conflictOfInterest: false,
            bidSummary: { bids: [], embargoed: false, bidCount: 0, biddingClosesAt: null },
          },
        ],
        alerts: [
          {
            contractId: 1,
            title: 'Expiring Soon',
            vendorName: 'Vendor',
            endDate: '2026-03-15',
            daysUntilExpiry: 21,
            window: '30_days',
          },
        ],
      },
    });

    renderContainer();
    expect(screen.getByText(/Expiration Alerts/)).toBeDefined();
    expect(screen.getByText(/expires in 21 days/)).toBeDefined();
  });

  it('surfaces the query error message', () => {
    setQueryState({ isLoading: false, error: new Error('boom'), data: undefined });
    renderContainer();
    expect(screen.getByText(/Error: boom/)).toBeDefined();
  });
});
