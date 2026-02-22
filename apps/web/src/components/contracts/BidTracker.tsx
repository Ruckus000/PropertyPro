'use client';

/**
 * P3-52: Bid tracker panel for a specific contract.
 *
 * Shows bid list (or embargoed summary if bidding is still open).
 * Allows adding new bids via POST /api/v1/contracts with action=add_bid.
 */
import { useState } from 'react';
import type { ContractRecord } from './types';

interface BidTrackerProps {
  communityId: number;
  contract: ContractRecord;
  onClose: () => void;
  onBidAdded: () => void;
}

export function BidTracker({ communityId, contract, onClose, onBidAdded }: BidTrackerProps) {
  const [showAddBid, setShowAddBid] = useState(false);
  const [vendorName, setVendorName] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddBid(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_bid',
          communityId,
          contractId: contract.id,
          vendorName,
          bidAmount,
          notes: notes || null,
        }),
      });

      if (!res.ok) {
        const errJson = (await res.json()) as { error: { message: string } };
        throw new Error(errJson.error.message);
      }

      setVendorName('');
      setBidAmount('');
      setNotes('');
      setShowAddBid(false);
      onBidAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add bid');
    } finally {
      setSaving(false);
    }
  }

  const { bidSummary } = contract;

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">
          Bids for: {contract.title}
        </h2>
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
          Close
        </button>
      </div>

      {bidSummary.embargoed ? (
        <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-700">
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
            <p className="text-sm text-gray-500">No bids submitted yet.</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    Vendor
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    Amount
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    Submitted
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {bidSummary.bids.map((bid) => (
                  <tr key={bid.id}>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {bid.vendorName}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      ${bid.bidAmount}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {bid.submittedAt
                        ? new Date(bid.submittedAt).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
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
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            + Add Bid
          </button>
        ) : (
          <div className="rounded-md border border-gray-200 p-4">
            {error && (
              <div className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>
            )}
            <form onSubmit={(e) => void handleAddBid(e)} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="bid-vendor" className="block text-sm font-medium text-gray-700">
                    Vendor Name *
                  </label>
                  <input
                    id="bid-vendor"
                    type="text"
                    required
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="bid-amount" className="block text-sm font-medium text-gray-700">
                    Bid Amount ($) *
                  </label>
                  <input
                    id="bid-amount"
                    type="text"
                    required
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="bid-notes" className="block text-sm font-medium text-gray-700">
                  Notes
                </label>
                <textarea
                  id="bid-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddBid(false)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
