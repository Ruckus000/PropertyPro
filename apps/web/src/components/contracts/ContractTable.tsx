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
        return 'bg-status-success-bg text-status-success';
      case 'draft':
        return 'bg-surface-muted text-content';
      case 'expired':
        return 'bg-status-danger-bg text-status-danger';
      case 'terminated':
        return 'bg-status-warning-bg text-status-warning';
      default:
        return 'bg-surface-muted text-content';
    }
  }

  function getAlertBadge(contractId: number): ExpirationAlert | undefined {
    return alerts.find((a) => a.contractId === contractId);
  }

  if (loading) {
    return <div className="text-sm text-content-tertiary">Loading contracts...</div>;
  }

  if (error) {
    return <div className="text-sm text-status-danger">Error: {error}</div>;
  }

  return (
    <div>
      {/* Expiration alerts summary */}
      {alerts.length > 0 && (
        <div className="mb-6 rounded-md border border-status-warning-border bg-status-warning-bg p-4">
          <h3 className="text-sm font-medium text-status-warning">Expiration Alerts</h3>
          <ul className="mt-2 space-y-1">
            {alerts.map((alert) => (
              <li key={alert.contractId} className="text-sm text-status-warning">
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
          className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
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
        <p className="text-sm text-content-tertiary">No contracts found. Create one to get started.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-edge">
            <thead className="bg-surface-page">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Value</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Dates</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Bids</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge bg-surface-card">
              {contracts.map((contract) => {
                const alert = getAlertBadge(contract.id);
                return (
                  <tr key={contract.id} className="hover:bg-surface-hover">
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <div className="font-medium text-content">{contract.title}</div>
                      {contract.conflictOfInterest && (
                        <span className="mt-1 inline-block rounded bg-status-danger-bg px-2 py-0.5 text-xs text-status-danger">
                          COI Declared
                        </span>
                      )}
                      {alert && (
                        <span className="mt-1 ml-1 inline-block rounded bg-status-warning-bg px-2 py-0.5 text-xs text-status-warning">
                          {alert.window === 'expired'
                            ? 'Expired'
                            : `${alert.daysUntilExpiry}d to expiry`}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-content-secondary">
                      {contract.vendorName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-content-secondary">
                      {contract.contractValue ? `$${contract.contractValue}` : '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-content-secondary">
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
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-content-secondary">
                      {contract.bidSummary.embargoed ? (
                        <span className="text-status-warning">
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
                        className="mr-2 text-content-link hover:text-content-link"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          setSelectedContract(contract);
                        }}
                        className="text-content-secondary hover:text-content"
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
