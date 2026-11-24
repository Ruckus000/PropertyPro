/**
 * A contract's own page, as a view: what it prints from the record it is
 * handed, and the "Add bid" form in its Bids section. That the record arrives
 * sealed is proved one level up, in `contract-pages.test.tsx`.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describeAccess } from '@/lib/access/describe-access';
import type { ContractRecordData } from '../../src/lib/services/contract-service';
import { CONTRACT_AMOUNT_MESSAGE } from '../../src/lib/contracts/contract-rules';

const h = vi.hoisted(() => ({
  addBid: vi.fn(),
  reset: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
  saveError: null as Error | null,
}));

vi.mock('next/navigation', () => ({ useRouter: () => h.router }));
vi.mock('@/hooks/use-contracts', () => ({
  useAddContractBid: () => ({ mutateAsync: h.addBid, isPending: false, error: h.saveError, reset: h.reset }),
}));

import { ContractDetailPage } from '../../src/components/contracts/contract-detail-page';

const about = describeAccess('condo_718', 'contracts', 'all')!;

const RECORD: ContractRecordData = {
  id: 7,
  title: 'Roof replacement',
  vendorName: 'RoofCo',
  description: 'Replace the flat roof',
  contractValue: '12500',
  startDate: '2027-01-01',
  endDate: '2027-06-30',
  biddingClosesAt: '2026-11-20T22:00:00.000Z',
  conflictOfInterest: false,
  conflictOfInterestNote: null,
  status: 'active',
  documentId: null,
  complianceChecklistItemId: null,
  document: null,
  complianceItem: null,
  bidSummary: {
    embargoed: false,
    bidCount: 1,
    bids: [{ id: 1, vendorName: 'Zephyr Roofing', bidAmount: '48250.5', submittedAt: '2026-11-18T15:30:00.000Z', notes: null }],
  },
};

function renderPage(over: Partial<ContractRecordData> = {}, canWrite = true) {
  return render(
    <ContractDetailPage
      communityId={42}
      contract={{ ...RECORD, ...over }}
      timeZone="America/New_York"
      canWrite={canWrite}
      about={about}
    />,
  );
}

describe('ContractDetailPage', () => {
  beforeEach(() => {
    h.addBid.mockReset().mockResolvedValue({ id: 5 });
    h.reset.mockReset();
    h.router.push.mockReset();
    h.router.refresh.mockReset();
    h.saveError = null;
  });

  it('titles the page with the contract, its status as a word beside it, and Edit in the header', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Roof replacement' })).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/contracts/7/edit?communityId=42');
  });

  it('has the three sections, and the Details panel with the access sentence', () => {
    renderPage();
    for (const name of ['Summary', 'Bids', 'Linked records', 'Details']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    const details = screen.getByRole('heading', { name: 'Details' }).closest('section')!;
    expect(within(details).getByText('RoofCo')).toBeInTheDocument();
    expect(within(details).getByText('Jan 1, 2027')).toBeInTheDocument();
    expect(within(details).getByText('Jun 30, 2027')).toBeInTheDocument();
    expect(within(details).getByText('Nov 20, 2026, 5:00 PM EST')).toBeInTheDocument();
    expect(within(details).getByText('None declared')).toBeInTheDocument();
    expect(screen.getByText(about)).toBeInTheDocument();
  });

  it('prints money as dollars, on the contract and on each bid', () => {
    renderPage();
    expect(screen.getByText('$12,500.00')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Bids' })).getByText('$48,250.50')).toBeInTheDocument();
    expect(screen.queryByText(/\$12500|\$48250/)).not.toBeInTheDocument();
  });

  it('shows a declared conflict of interest with its note, and each status by its word', () => {
    const { unmount } = renderPage({
      status: 'terminated',
      conflictOfInterest: true,
      conflictOfInterestNote: 'Treasurer owns the vendor',
    });
    expect(screen.getByText('Terminated')).toBeInTheDocument();
    expect(screen.getByText('Declared')).toBeInTheDocument();
    expect(screen.getByText('Treasurer owns the vendor')).toBeInTheDocument();
    unmount();

    renderPage({ status: 'draft' });
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('sealed: the notice with the count and the opening time, and no bids table', () => {
    renderPage({
      biddingClosesAt: '2099-12-12T22:00:00.000Z',
      bidSummary: { embargoed: true, bidCount: 3, bids: [] },
    });
    expect(screen.getByTestId('bids-sealed')).toHaveTextContent(
      'Bidding is sealed. 3 received. Opens Dec 12, 2099, 5:00 PM EST.',
    );
    expect(screen.getByText('3 sealed')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Bids' })).not.toBeInTheDocument();
  });

  it('no bids yet: says so', () => {
    renderPage({ bidSummary: { embargoed: false, bidCount: 0, bids: [] } });
    expect(screen.getByText('No bids recorded yet.')).toBeInTheDocument();
  });

  it('linked records: none, a document by title with a link, and an id that can no longer be read', () => {
    const none = renderPage();
    expect(screen.getAllByText('None linked')).toHaveLength(2);
    none.unmount();

    const linked = renderPage({
      documentId: 100,
      document: { id: 100, title: 'Signed roofing agreement' },
      complianceChecklistItemId: 200,
      complianceItem: { id: 200, title: 'Contracts and bids' },
    });
    expect(screen.getByRole('link', { name: 'Signed roofing agreement' })).toHaveAttribute(
      'href',
      '/communities/42/documents?doc=100',
    );
    expect(screen.getByText('Contracts and bids')).toBeInTheDocument();
    linked.unmount();

    renderPage({ documentId: 100, document: null });
    expect(screen.getByText('Document 100 (no longer available)')).toBeInTheDocument();
  });

  it('a viewer who cannot write gets no Edit and no Add bid', () => {
    renderPage({}, false);
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add bid' })).not.toBeInTheDocument();
  });

  describe('Add bid', () => {
    async function openForm() {
      await userEvent.click(screen.getByRole('button', { name: 'Add bid' }));
    }
    function type(label: string | RegExp, value: string) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }

    it('opens a small form in the Bids section, saves through the add-bid write, then reloads the page', async () => {
      renderPage();
      await openForm();
      const form = screen.getByRole('form', { name: 'Add bid' });
      expect(form.closest('section')).toBe(screen.getByRole('heading', { name: 'Bids' }).closest('section'));

      type(/^Vendor name/, 'Quarry Builders');
      type(/^Bid amount/, '51900.50');
      type('Notes', 'Two-year warranty');
      await userEvent.click(screen.getByRole('button', { name: 'Save bid' }));

      expect(h.addBid).toHaveBeenCalledWith({
        contractId: 7,
        vendorName: 'Quarry Builders',
        bidAmount: '51900.50',
        notes: 'Two-year warranty',
      });
      await waitFor(() => expect(h.router.refresh).toHaveBeenCalledTimes(1));
      // Closed again, back to the button.
      expect(screen.queryByRole('form', { name: 'Add bid' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add bid' })).toBeInTheDocument();
    });

    it('is still offered while bidding is sealed and after it has closed (recording a bid is never blocked)', () => {
      const sealed = renderPage({
        biddingClosesAt: '2099-12-12T22:00:00.000Z',
        bidSummary: { embargoed: true, bidCount: 3, bids: [] },
      });
      expect(screen.getByRole('button', { name: 'Add bid' })).toBeInTheDocument();
      sealed.unmount();

      renderPage();
      expect(screen.getByRole('button', { name: 'Add bid' })).toBeInTheDocument();
    });

    it('refuses 1,200 as an amount with the stated message, and sends nothing', async () => {
      renderPage();
      await openForm();
      type(/^Vendor name/, 'Quarry Builders');
      type(/^Bid amount/, '1,200');
      await userEvent.click(screen.getByRole('button', { name: 'Save bid' }));

      expect(screen.getByRole('alert')).toHaveTextContent(CONTRACT_AMOUNT_MESSAGE);
      expect(h.addBid).not.toHaveBeenCalled();
      expect(h.router.refresh).not.toHaveBeenCalled();
    });

    it("shows the server's message when the save fails, and keeps the form open", async () => {
      h.saveError = new Error('Contract not found in this community');
      h.addBid.mockRejectedValue(h.saveError);
      renderPage();
      await openForm();
      type(/^Vendor name/, 'Quarry Builders');
      type(/^Bid amount/, '100');
      await userEvent.click(screen.getByRole('button', { name: 'Save bid' }));

      expect(screen.getByRole('alert')).toHaveTextContent('Contract not found in this community');
      expect(screen.getByRole('form', { name: 'Add bid' })).toBeInTheDocument();
      expect(h.router.refresh).not.toHaveBeenCalled();
    });

    it('Cancel closes the form without saving', async () => {
      renderPage();
      await openForm();
      type(/^Vendor name/, 'Quarry Builders');
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('form', { name: 'Add bid' })).not.toBeInTheDocument();
      expect(h.addBid).not.toHaveBeenCalled();
    });
  });
});
