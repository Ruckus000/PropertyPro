/**
 * Unit tests for ContractTable component (P3-52).
 *
 * Tests cover:
 * - Renders loading state
 * - Renders contract rows
 * - Displays expiration alert badges
 * - Shows bid embargo indicators
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ContractTable } from '../../src/components/contracts/ContractTable';

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

function makeContractResponse(contracts: Record<string, unknown>[] = [], alerts: Record<string, unknown>[] = []) {
  return {
    ok: true,
    json: () => Promise.resolve({ data: contracts, alerts }),
  };
}

describe('ContractTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ContractTable communityId={42} />);
    expect(screen.getByText('Loading contracts...')).toBeDefined();
  });

  it('renders empty state when no contracts', async () => {
    fetchMock.mockResolvedValue(makeContractResponse());
    render(<ContractTable communityId={42} />);

    await waitFor(() => {
      expect(screen.getByText('No contracts found. Create one to get started.')).toBeDefined();
    });
  });

  it('renders contract rows', async () => {
    fetchMock.mockResolvedValue(
      makeContractResponse([
        {
          id: 1,
          title: 'Roof Maintenance',
          vendorName: 'RoofCo',
          contractValue: '50000.00',
          startDate: '2026-01-01',
          endDate: '2027-01-01',
          status: 'active',
          conflictOfInterest: false,
          bidSummary: { bids: [], embargoed: false, bidCount: 0, biddingClosesAt: null },
        },
      ]),
    );

    render(<ContractTable communityId={42} />);

    await waitFor(() => {
      expect(screen.getByText('Roof Maintenance')).toBeDefined();
      expect(screen.getByText('RoofCo')).toBeDefined();
      expect(screen.getByText('$50000.00')).toBeDefined();
    });
  });

  it('shows embargo indicator for sealed bids', async () => {
    fetchMock.mockResolvedValue(
      makeContractResponse([
        {
          id: 1,
          title: 'Sealed Contract',
          vendorName: 'Vendor',
          contractValue: null,
          startDate: '2026-01-01',
          endDate: null,
          status: 'active',
          conflictOfInterest: false,
          bidSummary: {
            bids: [],
            embargoed: true,
            bidCount: 3,
            biddingClosesAt: '2026-12-31T00:00:00Z',
          },
        },
      ]),
    );

    render(<ContractTable communityId={42} />);

    await waitFor(() => {
      expect(screen.getByText('3 sealed')).toBeDefined();
    });
  });

  it('shows conflict of interest badge', async () => {
    fetchMock.mockResolvedValue(
      makeContractResponse([
        {
          id: 1,
          title: 'COI Contract',
          vendorName: 'Vendor',
          contractValue: null,
          startDate: '2026-01-01',
          endDate: null,
          status: 'active',
          conflictOfInterest: true,
          bidSummary: { bids: [], embargoed: false, bidCount: 0, biddingClosesAt: null },
        },
      ]),
    );

    render(<ContractTable communityId={42} />);

    await waitFor(() => {
      expect(screen.getByText('COI Declared')).toBeDefined();
    });
  });

  it('shows expiration alerts', async () => {
    fetchMock.mockResolvedValue(
      makeContractResponse(
        [
          {
            id: 1,
            title: 'Expiring Soon',
            vendorName: 'Vendor',
            contractValue: null,
            startDate: '2026-01-01',
            endDate: '2026-03-15',
            status: 'active',
            conflictOfInterest: false,
            bidSummary: { bids: [], embargoed: false, bidCount: 0, biddingClosesAt: null },
          },
        ],
        [
          {
            contractId: 1,
            title: 'Expiring Soon',
            vendorName: 'Vendor',
            endDate: '2026-03-15',
            daysUntilExpiry: 21,
            window: '30_days',
          },
        ],
      ),
    );

    render(<ContractTable communityId={42} />);

    await waitFor(() => {
      expect(screen.getByText(/Expiration Alerts/)).toBeDefined();
      expect(screen.getByText(/expires in 21 days/)).toBeDefined();
    });
  });
});
