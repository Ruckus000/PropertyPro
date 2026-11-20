'use client';

/**
 * P3-52: Contract listing table — pure-prop presenter (B5 pattern).
 *
 * Renders the contract list, expiration alerts, status pills, and edit/bid
 * action buttons. Data fetching and cache invalidation live in
 * `<ContractTableContainer />` (see `contract-table-container.tsx`).
 *
 * UI state that is purely local (which row is selected for edit/bid, whether
 * the form modal is open) stays here in the presenter — this is consistent
 * with the documents/announcements precedent: container = data, presenter =
 * UI state.
 */
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ContractForm } from './ContractForm';
import { BidTracker } from './BidTracker';
import type { ContractRecord, ExpirationAlert } from './types';
import { Table } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';

// Only an empty community renders it, so it loads on demand (perf-check budget).
const ContractsFirstRun = dynamic(
  () => import('./contracts-empty').then((m) => m.ContractsFirstRun),
  { loading: () => <div className="min-h-96 animate-pulse rounded-md bg-surface-muted" aria-hidden="true" /> },
);

interface ContractTableProps {
  /** Pure-prop presenter input — fetched by the container. */
  contracts: ContractRecord[];
  alerts: ExpirationAlert[];
  isLoading: boolean;
  errorMessage: string | null;
  /** Passed through to child mutation components (`<ContractForm />`, `<BidTracker />`). */
  communityId: number;
}

export function ContractTable({
  contracts,
  alerts,
  isLoading,
  errorMessage,
  communityId,
}: ContractTableProps) {
  const [showForm, setShowForm] = useState(false);
  const [selectedContract, setSelectedContract] = useState<ContractRecord | null>(null);
  // The form replaces the empty hero; after Cancel the hero remounts, so its button takes focus back.
  const [formCancelled, setFormCancelled] = useState(false);

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

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading contracts">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (errorMessage) {
    return <AlertBanner status="danger" title="We couldn't load contracts." description={errorMessage} />;
  }

  const isEmpty = contracts.length === 0;

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

      {/* Actions: hidden while empty, when the first-run hero owns the action (spec D19). */}
      {!isEmpty && (
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
      )}

      {/* Form modal */}
      {showForm && (
        <ContractForm
          communityId={communityId}
          contract={selectedContract}
          onClose={() => {
            setShowForm(false);
            setFormCancelled(true);
          }}
          onSaved={() => setShowForm(false)}
        />
      )}

      {/* Bid tracker panel */}
      {selectedContract && !showForm && (
        <BidTracker
          communityId={communityId}
          contract={selectedContract}
          onClose={() => setSelectedContract(null)}
        />
      )}

      {/* Table */}
      {isEmpty ? (
        showForm ? null : (
          <ContractsFirstRun
            communityId={communityId}
            autoFocusAction={formCancelled}
            onAdd={() => {
              setSelectedContract(null);
              setShowForm(true);
            }}
          />
        )
      ) : (
        <Table className="min-w-full divide-y divide-edge">
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
        </Table>
      )}
    </div>
  );
}
