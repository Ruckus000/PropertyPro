'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/* ─────── Types ─────── */

interface DelinquentUnit {
  unitId: number;
  overdueAmountCents: number;
  daysOverdue: number;
  lineItemCount: number;
  lienEligible: boolean;
}

interface LedgerEntry {
  id: number;
  entryType: string;
  amountCents: number;
  description: string;
  unitId: number | null;
  sourceType: string;
  sourceId: string | null;
  createdAt: string;
}

interface PaymentHistoryItem {
  id: number;
  unitId: number;
  amountCents: number;
  dueDate: string;
  paidAt: string | null;
  lateFeeCents: number;
}

interface FinanceDashboardProps {
  communityId: number;
  userId: string;
  userRole: string;
}

/* ─────── Helpers ─────── */

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const ENTRY_TYPE_STYLES: Record<string, string> = {
  assessment: 'bg-blue-100 text-blue-800',
  payment: 'bg-green-100 text-green-800',
  refund: 'bg-orange-100 text-orange-800',
  fine: 'bg-red-100 text-red-800',
  fee: 'bg-purple-100 text-purple-800',
  adjustment: 'bg-gray-100 text-gray-800',
};

/* ─────── Fetch ─────── */

async function fetchDelinquent(communityId: number): Promise<DelinquentUnit[]> {
  const res = await fetch(`/api/v1/delinquency?communityId=${communityId}`);
  if (!res.ok) throw new Error('Failed to load delinquency data');
  const json = await res.json();
  return json.data;
}

async function fetchLedger(communityId: number, entryType?: string): Promise<LedgerEntry[]> {
  const params = new URLSearchParams({ communityId: String(communityId), limit: '100' });
  if (entryType) params.set('entryType', entryType);
  const res = await fetch(`/api/v1/ledger?${params}`);
  if (!res.ok) throw new Error('Failed to load ledger');
  const json = await res.json();
  return json.data;
}

async function fetchPaymentHistory(communityId: number): Promise<PaymentHistoryItem[]> {
  const res = await fetch(`/api/v1/payments/history?communityId=${communityId}`);
  if (!res.ok) throw new Error('Failed to load payment history');
  const json = await res.json();
  return json.data;
}

/* ─────── Main Component ─────── */

export function FinanceDashboard({ communityId, userId, userRole }: FinanceDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'ledger' | 'delinquent'>('overview');
  const [entryTypeFilter, setEntryTypeFilter] = useState<string>('');

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['finance-payments', communityId],
    queryFn: () => fetchPaymentHistory(communityId),
    staleTime: 30_000,
  });

  const { data: delinquent, isLoading: delinquentLoading } = useQuery({
    queryKey: ['finance-delinquent', communityId],
    queryFn: () => fetchDelinquent(communityId),
    staleTime: 60_000,
  });

  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ['finance-ledger', communityId, entryTypeFilter],
    queryFn: () => fetchLedger(communityId, entryTypeFilter || undefined),
    staleTime: 30_000,
    enabled: activeTab === 'ledger' || activeTab === 'overview',
  });

  // Collection summary stats
  const totalCollectedCents = payments?.reduce((sum, p) => sum + p.amountCents + p.lateFeeCents, 0) ?? 0;
  const totalOverdueCents = delinquent?.reduce((sum, d) => sum + d.overdueAmountCents, 0) ?? 0;
  const delinquentCount = delinquent?.length ?? 0;
  const lienEligibleCount = delinquent?.filter((d) => d.lienEligible).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Collected" value={formatCents(totalCollectedCents)} loading={paymentsLoading} />
        <StatCard label="Outstanding" value={formatCents(totalOverdueCents)} loading={delinquentLoading} />
        <StatCard label="Delinquent Units" value={String(delinquentCount)} loading={delinquentLoading} />
        <StatCard label="Lien Eligible" value={String(lienEligibleCount)} loading={delinquentLoading} />
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {(['overview', 'ledger', 'delinquent'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium capitalize ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab === 'delinquent' ? 'Delinquent Units' : tab === 'ledger' ? 'Ledger' : 'Recent Payments'}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <RecentPayments items={payments ?? []} loading={paymentsLoading} />
      )}

      {activeTab === 'ledger' && (
        <LedgerViewer
          entries={ledger ?? []}
          loading={ledgerLoading}
          entryTypeFilter={entryTypeFilter}
          onFilterChange={setEntryTypeFilter}
          communityId={communityId}
        />
      )}

      {activeTab === 'delinquent' && (
        <DelinquentUnitsTable units={delinquent ?? []} loading={delinquentLoading} communityId={communityId} />
      )}
    </div>
  );
}

/* ─────── Sub-components ─────── */

function StatCard({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      {loading ? (
        <div className="mt-1 h-7 w-24 animate-pulse rounded bg-gray-200" />
      ) : (
        <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      )}
    </div>
  );
}

function RecentPayments({ items, loading }: { items: PaymentHistoryItem[]; loading: boolean }) {
  if (loading) {
    return <div className="h-48 animate-pulse rounded-lg bg-gray-200" />;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">No payments received yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Unit</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Paid On</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Late Fee</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.slice(0, 25).map((item) => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">Unit #{item.unitId}</td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                {item.paidAt ? formatDateTime(item.paidAt) : '-'}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                {formatCents(item.amountCents)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-500">
                {item.lateFeeCents > 0 ? formatCents(item.lateFeeCents) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LedgerViewer({
  entries,
  loading,
  entryTypeFilter,
  onFilterChange,
  communityId,
}: {
  entries: LedgerEntry[];
  loading: boolean;
  entryTypeFilter: string;
  onFilterChange: (type: string) => void;
  communityId: number;
}) {
  return (
    <div className="space-y-4">
      {/* Filter + Export */}
      <div className="flex items-center justify-between">
        <select
          value={entryTypeFilter}
          onChange={(e) => onFilterChange(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">All Types</option>
          <option value="assessment">Assessments</option>
          <option value="payment">Payments</option>
          <option value="refund">Refunds</option>
          <option value="fine">Fines</option>
          <option value="fee">Fees</option>
          <option value="adjustment">Adjustments</option>
        </select>

        <a
          href={`/api/v1/finance/export/csv?communityId=${communityId}`}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Export CSV
        </a>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-lg bg-gray-200" />
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-500">No ledger entries found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Unit</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {formatDateTime(entry.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ENTRY_TYPE_STYLES[entry.entryType] || 'bg-gray-100 text-gray-600'}`}>
                      {entry.entryType}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-sm text-gray-900">{entry.description}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {entry.unitId ? `Unit #${entry.unitId}` : '-'}
                  </td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-medium ${entry.amountCents >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {entry.amountCents >= 0 ? '+' : ''}{formatCents(Math.abs(entry.amountCents))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DelinquentUnitsTable({ units, loading, communityId }: { units: DelinquentUnit[]; loading: boolean; communityId: number }) {
  const queryClient = useQueryClient();
  const [waivingUnitId, setWaivingUnitId] = useState<number | null>(null);

  const waiveMutation = useMutation({
    mutationFn: async (unitId: number) => {
      const res = await fetch(`/api/v1/delinquency/${unitId}/waive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      if (!res.ok) throw new Error('Failed to waive late fees');
      return res.json();
    },
    onSuccess: () => {
      setWaivingUnitId(null);
      queryClient.invalidateQueries({ queryKey: ['finance-delinquent', communityId] });
      queryClient.invalidateQueries({ queryKey: ['finance-ledger', communityId] });
    },
  });

  if (loading) {
    return <div className="h-48 animate-pulse rounded-lg bg-gray-200" />;
  }

  if (units.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
        <svg
          className="mx-auto h-10 w-10 text-green-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="mt-2 text-sm font-medium text-green-900">No delinquent units</p>
        <p className="text-sm text-green-700">All units are current on their assessments.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Unit</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Overdue Amount</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Days Overdue</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Line Items</th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">Lien Eligible</th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {units.map((unit) => (
            <tr key={unit.unitId} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">Unit #{unit.unitId}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-red-600 font-medium">
                {formatCents(unit.overdueAmountCents)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">{unit.daysOverdue}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">{unit.lineItemCount}</td>
              <td className="px-4 py-3 text-center">
                {unit.lienEligible ? (
                  <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                    Yes
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">No</span>
                )}
              </td>
              <td className="px-4 py-3 text-center">
                {waivingUnitId === unit.unitId ? (
                  <div className="inline-flex items-center gap-2">
                    <span className="text-xs text-gray-500">Waive fees?</span>
                    <button
                      onClick={() => waiveMutation.mutate(unit.unitId)}
                      disabled={waiveMutation.isPending}
                      className="rounded bg-yellow-500 px-2 py-1 text-xs font-medium text-white hover:bg-yellow-600 disabled:opacity-50"
                    >
                      {waiveMutation.isPending ? 'Waiving...' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setWaivingUnitId(null)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setWaivingUnitId(unit.unitId)}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    Waive Fees
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {waiveMutation.isError && (
        <p className="px-4 py-2 text-xs text-red-600">Failed to waive fees. Please try again.</p>
      )}
    </div>
  );
}
