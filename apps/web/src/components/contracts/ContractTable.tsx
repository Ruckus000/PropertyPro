'use client';

/**
 * P3-52: Contract listing table with expiration alerts and bid tracking.
 *
 * Fetches contracts from /api/v1/contracts and displays them in a table
 * with expiration alert badges and bid summary (embargoed or revealed).
 */
import { useState, useEffect, useCallback } from 'react';
import { ContractForm } from './ContractForm';
import { BidTracker } from './BidTracker';
import type { ContractRecord, ExpirationAlert } from './types';

interface ContractTableProps {
  communityId: number;
}

export function ContractTable({ communityId }: ContractTableProps) {
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [alerts, setAlerts] = useState<ExpirationAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedContract, setSelectedContract] = useState<ContractRecord | null>(null);

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/contracts?communityId=${communityId}`);
      if (!res.ok) {
        const errJson = (await res.json()) as { error: { message: string } };
        throw new Error(errJson.error.message);
      }
      const json = (await res.json()) as { data: ContractRecord[]; alerts: ExpirationAlert[] };
      setContracts(json.data);
      setAlerts(json.alerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contracts');
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    void fetchContracts();
  }, [fetchContracts]);

  function getStatusBadgeColor(status: string): string {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      case 'terminated':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  function getAlertBadge(contractId: number): ExpirationAlert | undefined {
    return alerts.find((a) => a.contractId === contractId);
  }

  if (loading) {
    return <div className="text-sm text-gray-500">Loading contracts...</div>;
  }

  if (error) {
    return <div className="text-sm text-red-600">Error: {error}</div>;
  }

  return (
    <div>
      {/* Expiration alerts summary */}
      {alerts.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-medium text-amber-800">Expiration Alerts</h3>
          <ul className="mt-2 space-y-1">
            {alerts.map((alert) => (
              <li key={alert.contractId} className="text-sm text-amber-700">
                <strong>{alert.title}</strong> ({alert.vendorName}) &mdash;{' '}
                {alert.window === 'expired'
                  ? 'Expired'
                  : `expires in ${alert.daysUntilExpiry} days`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => {
            setSelectedContract(null);
            setShowForm(true);
          }}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add Contract
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <ContractForm
          communityId={communityId}
          contract={selectedContract}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void fetchContracts();
          }}
        />
      )}

      {/* Bid tracker panel */}
      {selectedContract && !showForm && (
        <BidTracker
          communityId={communityId}
          contract={selectedContract}
          onClose={() => setSelectedContract(null)}
          onBidAdded={() => void fetchContracts()}
        />
      )}

      {/* Table */}
      {contracts.length === 0 ? (
        <p className="text-sm text-gray-500">No contracts found. Create one to get started.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Value</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Dates</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Bids</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {contracts.map((contract) => {
                const alert = getAlertBadge(contract.id);
                return (
                  <tr key={contract.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <div className="font-medium text-gray-900">{contract.title}</div>
                      {contract.conflictOfInterest && (
                        <span className="mt-1 inline-block rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">
                          COI Declared
                        </span>
                      )}
                      {alert && (
                        <span className="mt-1 ml-1 inline-block rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                          {alert.window === 'expired'
                            ? 'Expired'
                            : `${alert.daysUntilExpiry}d to expiry`}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {contract.vendorName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {contract.contractValue ? `$${contract.contractValue}` : '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {contract.startDate}
                      {contract.endDate ? ` - ${contract.endDate}` : ' - Open'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusBadgeColor(contract.status)}`}
                      >
                        {contract.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {contract.bidSummary.embargoed ? (
                        <span className="text-amber-600">
                          {contract.bidSummary.bidCount} sealed
                        </span>
                      ) : (
                        <span>{contract.bidSummary.bidCount} bid(s)</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <button
                        onClick={() => {
                          setSelectedContract(contract);
                          setShowForm(true);
                        }}
                        className="mr-2 text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          setSelectedContract(contract);
                        }}
                        className="text-gray-600 hover:text-gray-800"
                      >
                        Bids
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
