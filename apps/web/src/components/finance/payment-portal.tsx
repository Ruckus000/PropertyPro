'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PaymentFeePolicy } from '@propertypro/shared';
import { PaymentDialog } from './payment-dialog';

/* ─────── Types ─────── */

interface LineItem {
  id: number;
  assessmentId: number | null;
  unitId: number;
  amountCents: number;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue' | 'waived';
  paidAt: string | null;
  paymentIntentId: string | null;
  lateFeeCents: number;
}

interface LedgerEntry {
  id: number;
  entryType: string;
  amountCents: number;
  description: string;
  createdAt: string;
}

interface StatementData {
  unitId: number;
  balanceCents: number;
  ledgerEntries: LedgerEntry[];
  lineItems: LineItem[];
}

interface PaymentPortalProps {
  communityId: number;
  userId: string;
  userRole: string;
  isUnitOwner: boolean;
  /** Required for non-owner roles; owners' unitId is resolved server-side. */
  unitId?: number;
}

/* ─────── Helpers ─────── */

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-800',
  paid: 'bg-green-100 text-green-800',
  waived: 'bg-gray-100 text-gray-600',
};

/* ─────── Fetch ─────── */

async function fetchStatement(communityId: number, unitId?: number): Promise<StatementData> {
  const params = new URLSearchParams({ communityId: String(communityId) });
  if (unitId) params.set('unitId', String(unitId));
  const res = await fetch(`/api/v1/payments/statement?${params}`);
  if (!res.ok) throw new Error('Failed to load payment data');
  const json = await res.json();
  return json.data;
}

async function fetchFeePolicy(communityId: number): Promise<PaymentFeePolicy> {
  const res = await fetch(`/api/v1/payments/fee-policy?communityId=${communityId}`);
  if (!res.ok) return 'association_absorbs';
  const json = await res.json();
  return json.data.feePolicy;
}

/* ─────── Component ─────── */

export function PaymentPortal({ communityId, userId, userRole, isUnitOwner, unitId }: PaymentPortalProps) {
  const [payingLineItem, setPayingLineItem] = useState<LineItem | null>(null);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['payment-portal', communityId, unitId],
    queryFn: () => fetchStatement(communityId, unitId),
    staleTime: 30_000,
    retry: false,
  });

  const { data: feePolicy } = useQuery({
    queryKey: ['fee-policy', communityId],
    queryFn: () => fetchFeePolicy(communityId),
    staleTime: 60_000,
  });

  if (isPending) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-24 rounded-lg bg-gray-200" />
          <div className="h-64 rounded-lg bg-gray-200" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-700">
          {error instanceof Error ? error.message : 'Failed to load payment data. Please try again later.'}
        </p>
      </div>
    );
  }

  if (!data) return null;

  const unpaidItems = data.lineItems.filter((li) => li.status === 'pending' || li.status === 'overdue');
  const paidItems = data.lineItems.filter((li) => li.status === 'paid');
  const totalDueCents = unpaidItems.reduce((sum, li) => sum + li.amountCents + li.lateFeeCents, 0);
  const overdueCount = unpaidItems.filter((li) => li.status === 'overdue').length;

  return (
    <div className="space-y-6">
      {/* Balance Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Current Balance"
          value={formatCents(data.balanceCents)}
          accent={data.balanceCents > 0 ? 'red' : data.balanceCents === 0 ? 'green' : 'blue'}
        />
        <SummaryCard
          label="Total Due"
          value={formatCents(totalDueCents)}
          accent={totalDueCents > 0 ? 'yellow' : 'green'}
        />
        <SummaryCard
          label="Overdue Items"
          value={String(overdueCount)}
          accent={overdueCount > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <TabButton
            label="Upcoming"
            count={unpaidItems.length}
            active={activeTab === 'upcoming'}
            onClick={() => setActiveTab('upcoming')}
          />
          <TabButton
            label="Payment History"
            count={paidItems.length}
            active={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
          />
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'upcoming' && (
        <UpcomingAssessments
          items={unpaidItems}
          onPay={setPayingLineItem}
          canPay={isUnitOwner || userRole !== 'resident'}
          feePolicy={feePolicy}
        />
      )}

      {activeTab === 'history' && <PaymentHistory items={paidItems} />}

      {/* Payment Dialog */}
      {payingLineItem && (
        <PaymentDialog
          communityId={communityId}
          lineItem={payingLineItem}
          onClose={() => setPayingLineItem(null)}
          onSuccess={() => {
            setPayingLineItem(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

/* ─────── Sub-components ─────── */

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'red' | 'green' | 'yellow' | 'blue';
}) {
  const colors: Record<string, string> = {
    red: 'border-red-200 bg-red-50',
    green: 'border-green-200 bg-green-50',
    yellow: 'border-yellow-200 bg-yellow-50',
    blue: 'border-blue-200 bg-blue-50',
  };
  const textColors: Record<string, string> = {
    red: 'text-red-900',
    green: 'text-green-900',
    yellow: 'text-yellow-900',
    blue: 'text-blue-900',
  };

  return (
    <div className={`rounded-lg border p-4 ${colors[accent]}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${textColors[accent]}`}>{value}</p>
    </div>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${
        active
          ? 'border-indigo-600 text-indigo-600'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
      }`}
    >
      {label}
      {count > 0 && (
        <span
          className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            active ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function UpcomingAssessments({
  items,
  onPay,
  canPay,
  feePolicy,
}: {
  items: LineItem[];
  feePolicy?: PaymentFeePolicy;
  onPay: (item: LineItem) => void;
  canPay: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <svg
          className="mx-auto h-10 w-10 text-green-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="mt-2 text-sm font-medium text-gray-900">All caught up!</p>
        <p className="text-sm text-gray-500">You have no outstanding assessments.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Due Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Late Fee</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Total</th>
            {canPay && <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Action</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => {
            const totalCents = item.amountCents + item.lateFeeCents;
            return (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">{formatDate(item.dueDate)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[item.status] || ''}`}>
                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">{formatCents(item.amountCents)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-500">
                  {item.lateFeeCents > 0 ? formatCents(item.lateFeeCents) : '-'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">{formatCents(totalCents)}</td>
                {canPay && (
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      onClick={() => onPay(item)}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      Pay Now
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {feePolicy === 'owner_pays' && canPay && (
        <p className="px-4 py-2 text-xs text-gray-500">
          Online payments include a small convenience fee.
        </p>
      )}
    </div>
  );
}

function PaymentHistory({ items }: { items: LineItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">No payment history yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Due Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Paid On</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Amount</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">{formatDate(item.dueDate)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                {item.paidAt ? new Date(item.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">{formatCents(item.amountCents)}</td>
              <td className="px-4 py-3 text-right">
                <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                  Paid
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
