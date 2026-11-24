/**
 * The Contracts list (`/contracts`): five columns, each row a link to the
 * contract's own page, and a state for loading, failing and having nothing.
 * `useContracts` is a stand-in; everything the page draws from it is real.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describeAccess } from '@/lib/access/describe-access';
import type { ContractRecord, ExpirationAlert } from '../../src/components/contracts/types';

const useContractsMock = vi.fn();
vi.mock('@/hooks/use-contracts', () => ({
  useContracts: (opts: unknown) => useContractsMock(opts),
}));

import { ContractsListPage } from '../../src/components/contracts/contracts-list-page';

const about = describeAccess('condo_718', 'contracts', 'all')!;
const refetch = vi.fn();

function loaded(contracts: ContractRecord[], alerts: ExpirationAlert[] = []) {
  useContractsMock.mockReturnValue({
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    data: { contracts, alerts },
    refetch,
  });
}

function contract(over: Partial<ContractRecord> = {}): ContractRecord {
  return {
    id: 1,
    title: 'Roof Maintenance',
    vendorName: 'RoofCo',
    description: null,
    contractValue: '12500.00',
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    documentId: null,
    complianceChecklistItemId: null,
    biddingClosesAt: null,
    status: 'active',
    conflictOfInterest: false,
    bidSummary: { bids: [], embargoed: false, bidCount: 3, biddingClosesAt: null },
    ...over,
  };
}

function renderPage(canWrite = true) {
  return render(
    <ContractsListPage communityId={42} timeZone="America/New_York" canWrite={canWrite} about={about} />,
  );
}

describe('ContractsListPage', () => {
  beforeEach(() => {
    useContractsMock.mockReset();
    refetch.mockReset();
  });

  it('has exactly five columns: Contract, Value, Ends, Status, Bids', () => {
    loaded([contract()]);
    renderPage();

    const table = screen.getByRole('table', { name: 'Contracts' });
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Contract',
      'Value',
      'Ends',
      'Status',
      'Bids',
    ]);
    // One cell per column: nothing rides along in an unnamed sixth.
    expect(within(within(table).getAllByRole('row')[1]!).getAllByRole('cell')).toHaveLength(5);
  });

  it("a row's title is a link to the contract's own page, and the row has no buttons", () => {
    loaded([contract({ id: 17 })]);
    renderPage();

    expect(screen.getByRole('link', { name: 'Roof Maintenance' })).toHaveAttribute(
      'href',
      '/contracts/17?communityId=42',
    );
    const table = screen.getByRole('table', { name: 'Contracts' });
    expect(within(table).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the value as money, the vendor under the title, and the status as a word', () => {
    loaded([contract()]);
    renderPage();

    expect(screen.getByText('$12,500.00')).toBeInTheDocument();
    expect(screen.queryByText('$12500.00')).not.toBeInTheDocument();
    expect(screen.getByText('RoofCo')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Jan 1, 2027')).toBeInTheDocument();
  });

  it('says a conflict of interest in words, beside the vendor', () => {
    loaded([contract({ conflictOfInterest: true })]);
    renderPage();
    expect(screen.getByText('RoofCo · Conflict declared')).toBeInTheDocument();
  });

  it('counts bids as sealed while bidding is open, and by number after', () => {
    loaded([
      contract({ id: 1, title: 'Sealed one', bidSummary: { bids: [], embargoed: true, bidCount: 3, biddingClosesAt: '2099-01-01T00:00:00Z' } }),
      contract({ id: 2, title: 'Open one', bidSummary: { bids: [], embargoed: false, bidCount: 3, biddingClosesAt: null } }),
    ]);
    renderPage();

    expect(within(screen.getByRole('row', { name: /Sealed one/ })).getByText('3 sealed')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Open one/ })).getByText('3 bids')).toBeInTheDocument();
  });

  it('an open-ended contract says so, and has no time left', () => {
    loaded([contract({ endDate: null })]);
    renderPage();
    expect(screen.getByText('Open-ended')).toBeInTheDocument();
    expect(screen.queryByText(/left$|^Ended/)).not.toBeInTheDocument();
  });

  it("shows the time left under the end date, counted from the community's today", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 02:30 UTC on Dec 2 is still Dec 1 in Florida: 30 days to Dec 31, not 29.
    vi.setSystemTime(new Date('2026-12-02T02:30:00Z'));
    try {
      loaded([
        contract({ id: 1, title: 'Ending', endDate: '2026-12-31' }),
        contract({ id: 2, title: 'Retired', endDate: '2026-12-31', status: 'terminated' }),
      ]);
      renderPage();
      expect(within(screen.getByRole('row', { name: /Ending/ })).getByText('30 days left')).toBeInTheDocument();
      // A terminated contract is not counting down to anything.
      expect(within(screen.getByRole('row', { name: /Retired/ })).queryByText(/days left/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the expiring contracts in a notice above the table, each a link to its contract', () => {
    loaded(
      [contract({ id: 5, title: 'Expiring Soon', endDate: '2026-03-15' })],
      [{ contractId: 5, title: 'Expiring Soon', vendorName: 'RoofCo', endDate: '2026-03-15', daysUntilExpiry: 21, window: '30_days' }],
    );
    renderPage();

    const notice = screen.getByRole('heading', { level: 2, name: 'Expiration Alerts' });
    expect(screen.getByText('Expires in 21 days')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Contracts' });
    // Above: the notice comes first in reading order.
    expect(notice.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const links = screen.getAllByRole('link', { name: 'Expiring Soon' });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/contracts/5?communityId=42');
  });

  it('a manager who can write gets "Add contract" in the header, a link to the New page', () => {
    loaded([contract()]);
    renderPage();
    expect(screen.getByRole('link', { name: 'Add contract' })).toHaveAttribute(
      'href',
      '/contracts/new?communityId=42',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Contracts & Vendors' })).toBeInTheDocument();
    expect(screen.getByText(about)).toBeInTheDocument();
  });

  it('without write permission there is no "Add contract"', () => {
    loaded([contract()]);
    renderPage(false);
    expect(screen.queryByRole('link', { name: 'Add contract' })).not.toBeInTheDocument();
  });

  it('loading: a labelled skeleton, no table', () => {
    useContractsMock.mockReturnValue({ isLoading: true, isError: false, isSuccess: false, error: null, data: undefined, refetch });
    renderPage();
    expect(screen.getByRole('status', { name: 'Loading contracts' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('error: says what happened, with a Try again that reloads', async () => {
    useContractsMock.mockReturnValue({
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new Error('Failed to load contracts'),
      data: undefined,
      refetch,
    });
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load contracts. Please try again.");
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("error: passes on the server's own reason when it gave one", () => {
    useContractsMock.mockReturnValue({
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new Error('This community’s subscription has lapsed. Reactivate to restore access.'),
      data: undefined,
      refetch,
    });
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent('subscription has lapsed');
  });

  it('empty: the first-run hero owns the one "Add contract", a link to the New page', async () => {
    loaded([]);
    renderPage();

    // Dynamically loaded: find it, don't get it.
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Keep every vendor agreement in one place' }),
    ).toBeInTheDocument();
    const add = screen.getAllByRole('link', { name: 'Add contract' });
    expect(add).toHaveLength(1);
    expect(add[0]).toHaveAttribute('href', '/contracts/new?communityId=42');
    expect(screen.getByRole('link', { name: 'Track vendor contracts' })).toHaveAttribute(
      'href',
      '/help/website/contracts',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
