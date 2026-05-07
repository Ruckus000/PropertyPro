'use client';

/**
 * P3-52: Bid tracker panel for a specific contract.
 *
 * Shows bid list (or embargoed summary if bidding is still open). Submits new
 * bids via the `useAddContractBid` mutation hook from `@/hooks/use-contracts`,
 * which self-invalidates the contracts query on success.
 */
import { useState } from 'react';
import { useAddContractBid } from '@/hooks/use-contracts';
import type { ContractRecord } from './types';

interface BidTrackerProps {
  communityId: number;
  contract: ContractRecord;
  onClose: () => void;
  /** Optional: parent hook to run after a bid is added. The mutation self-invalidates the contracts query, so most parents have nothing to do. */
  onBidAdded?: () => void;
}

export function BidTracker({ communityId, contract, onClose, onBidAdded }: BidTrackerProps) {
  const [showAddBid, setShowAddBid] = useState(false);
  const [vendorName, setVendorName] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [notes, setNotes] = useState('');

  const addBid = useAddContractBid(communityId);
  const saving = addBid.isPending;
  const error = addBid.error instanceof Error ? addBid.error.message : null;

  async function handleAddBid(e: React.FormEvent) {
    e.preventDefault();
    try {
      await addBid.mutateAsync({
        contractId: contract.id,
        vendorName,
        bidAmount,
        notes: notes || null,
      });
      setVendorName('');
      setBidAmount('');
      setNotes('');
      setShowAddBid(false);
      onBidAdded?.();
    } catch {
      // error surfaced via `error` above
    }
  }

  const { bidSummary } = contract;

  return (
    <div className="mb-6 rounded-md border border-edge bg-surface-card p-6 shadow-e0">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-medium text-content">
          Bids for: {contract.title}
        </h2>
        <button onClick={onClose} className="text-sm text-content-tertiary hover:text-content-secondary">
          Close
        </button>
      </div>

      {bidSummary.embargoed ? (
        <div className="rounded-md bg-status-warning-bg p-4 text-sm text-status-warning">
          <p className="font-medium">Bidding is sealed</p>
          <p>
            {bidSummary.bidCount} bid(s) received. Details will be revealed after bidding closes
            {bidSummary.biddingClosesAt
              ? ` on ${new Date(bidSummary.biddingClosesAt).toLocaleDateString()}`
              : ''}.
          </p>
        </div>
      ) : (
        <div>
          {bidSummary.bids.length === 0 ? (
            <p className="text-sm text-content-tertiary">No bids submitted yet.</p>
          ) : (
            <table className="min-w-full divide-y divide-edge">
              <thead className="bg-surface-page">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-content-tertiary">
                    Vendor
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-content-tertiary">
                    Amount
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-content-tertiary">
                    Submitted
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-content-tertiary">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge bg-surface-card">
                {bidSummary.bids.map((bid) => (
                  <tr key={bid.id}>
                    <td className="px-4 py-2 text-sm text-content">
                      {bid.vendorName}
                    </td>
                    <td className="px-4 py-2 text-sm text-content-secondary">
                      ${bid.bidAmount}
                    </td>
                    <td className="px-4 py-2 text-sm text-content-secondary">
                      {bid.submittedAt
                        ? new Date(bid.submittedAt).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="px-4 py-2 text-sm text-content-secondary">
                      {bid.notes ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Add bid form */}
      <div className="mt-4">
        {!showAddBid ? (
          <button
            onClick={() => setShowAddBid(true)}
            className="text-sm font-medium text-content-link hover:text-content-link"
          >
            + Add Bid
          </button>
        ) : (
          <div className="rounded-md border border-edge p-4">
            {error && (
              <div className="mb-3 rounded-md bg-status-danger-bg p-2 text-sm text-status-danger">{error}</div>
            )}
            <form onSubmit={(e) => void handleAddBid(e)} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="bid-vendor" className="block text-sm font-medium text-content-secondary">
                    Vendor Name *
                  </label>
                  <input
                    id="bid-vendor"
                    type="text"
                    required
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    className="mt-1 block w-full rounded-md border-edge-strong shadow-e0 focus:border-edge-focus focus:ring-focus sm:text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="bid-amount" className="block text-sm font-medium text-content-secondary">
                    Bid Amount ($) *
                  </label>
                  <input
                    id="bid-amount"
                    type="text"
                    required
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 block w-full rounded-md border-edge-strong shadow-e0 focus:border-edge-focus focus:ring-focus sm:text-sm"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="bid-notes" className="block text-sm font-medium text-content-secondary">
                  Notes
                </label>
                <textarea
                  id="bid-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 block w-full rounded-md border-edge-strong shadow-e0 focus:border-edge-focus focus:ring-focus sm:text-sm"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddBid(false)}
                  className="rounded-md border border-edge-strong px-3 py-1.5 text-sm text-content-secondary hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-interactive px-3 py-1.5 text-sm font-medium text-content-inverse hover:bg-interactive-hover disabled:opacity-50"
                >
                  {saving ? 'Adding...' : 'Add Bid'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
