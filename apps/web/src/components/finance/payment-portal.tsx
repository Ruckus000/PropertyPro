'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { PaymentFeePolicy } from '@propertypro/shared';
import { PaymentDialog } from './payment-dialog';
import { AlertBanner } from '@/components/shared/alert-banner';
import { formatDateOnly } from '@/lib/utils/format-date';

/* ─────── Types ─────── */

type LineItemStatus = 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'waived';

interface LineItem {
  id: number;
  assessmentId: number | null;
  unitId: number;
  amountCents: number;
  dueDate: string;
  status: LineItemStatus;
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
  userRole: string;
  /** Required for non-owner roles; owners' unitId is resolved server-side. */
  unitId?: number;
  actorUnits?: Array<{ id: number; label: string }>;
  requiresExplicitUnitSelection?: boolean;
}

/* ─────── Helpers ─────── */

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/** @deprecated Use formatDateOnly from @/lib/utils/format-date */
const formatDate = formatDateOnly;

const STATUS_STYLES: Record<LineItemStatus, string> = {
  pending: 'bg-status-warning-bg text-status-warning',
  partially_paid: 'bg-status-info-bg text-status-info',
  overdue: 'bg-status-danger-bg text-status-danger',
  paid: 'bg-status-success-bg text-status-success',
  waived: 'bg-surface-muted text-content-secondary',
};

function formatStatusLabel(status: LineItemStatus): string {
  if (status === 'partially_paid') {
    return 'Partially paid';
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function StatusDotIcon({ className = 'h-2 w-2' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="4" r="4" />
    </svg>
  );
}

function StatusBadge({ status }: { status: LineItemStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}>
      <StatusDotIcon />
      {formatStatusLabel(status)}
    </span>
  );
}

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

export function PaymentPortal({
  communityId,
  userRole,
  unitId,
  actorUnits = [],
  requiresExplicitUnitSelection = false,
}: PaymentPortalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [payingLineItem, setPayingLineItem] = useState<LineItem | null>(null);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');
  const hasMultipleUnits = actorUnits.length > 1;
  const canLoadData = !requiresExplicitUnitSelection;

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['payment-portal', communityId, unitId],
    queryFn: () => fetchStatement(communityId, unitId),
    enabled: canLoadData,
    staleTime: 30_000,
    retry: false,
  });

  const { data: feePolicy } = useQuery({
    queryKey: ['fee-policy', communityId],
    queryFn: () => fetchFeePolicy(communityId),
    staleTime: 60_000,
  });

  const handleUnitChange = (nextUnitId: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('unitId', String(nextUnitId));
    router.replace(`${pathname}?${params.toString()}`);
  };

  if (requiresExplicitUnitSelection) {
    return (
      <div className="space-y-4">
        <AlertBanner
          status="warning"
          title="Select a unit to continue."
          description="Choose which unit's payments, history, and statements you want to view."
        />
        <UnitSelectCard
          actorUnits={actorUnits}
          selectedUnitId={unitId}
          onSelect={handleUnitChange}
        />
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-24 rounded-md bg-surface-muted" />
          <div className="h-64 rounded-md bg-surface-muted" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <AlertBanner
        status="danger"
        title="We couldn't load your payment data."
        description="Please try again or contact support if the issue persists."
        action={
          <button
            type="button"
            onClick={() => void refetch()}
            className="shrink-0 rounded-md border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs font-medium text-status-danger hover:opacity-90 min-h-10"
          >
            Retry
          </button>
        }
      />
    );
  }

  if (!data) return null;

  const unpaidItems = data.lineItems.filter(
    (li) => li.status === 'pending' || li.status === 'partially_paid' || li.status === 'overdue',
  );
  const paidItems = data.lineItems.filter((li) => li.status === 'paid');
  const totalDueCents = unpaidItems.reduce((sum, li) => sum + li.amountCents + li.lateFeeCents, 0);
  const overdueCount = unpaidItems.filter((li) => li.status === 'overdue').length;

  return (
    <div className="space-y-6">
      {hasMultipleUnits && (
        <UnitSelectCard
          actorUnits={actorUnits}
          selectedUnitId={unitId}
          onSelect={handleUnitChange}
        />
      )}

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

      {/* Tab Navigation + Actions */}
      <div className="flex flex-col gap-3 border-b border-edge sm:flex-row sm:items-end sm:justify-between">
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
        <button
          onClick={() => {
            const params = new URLSearchParams({ communityId: String(communityId) });
            if (unitId) params.set('unitId', String(unitId));
            window.open(`/api/v1/finance/export/statement?${params}`, '_blank');
          }}
          className="mb-1 inline-flex min-h-10 items-center gap-2 self-start rounded-md border border-edge-strong bg-surface-card px-3 py-2 text-xs font-medium text-content-secondary shadow-sm hover:bg-surface-hover sm:self-auto"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download PDF
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'upcoming' && (
        <UpcomingAssessments
          items={unpaidItems}
          onPay={setPayingLineItem}
          canPay={true}
          feePolicy={feePolicy}
        />
      )}

      {activeTab === 'history' && <PaymentHistory items={paidItems} />}

      {/* Payment Dialog */}
      {payingLineItem && (
        <PaymentDialog
          communityId={communityId}
          lineItem={payingLineItem}
          unitId={unitId}
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

function UnitSelectCard({
  actorUnits,
  selectedUnitId,
  onSelect,
}: {
  actorUnits: Array<{ id: number; label: string }>;
  selectedUnitId?: number;
  onSelect: (unitId: number) => void;
}) {
  if (actorUnits.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-edge bg-surface-card p-4">
      <label htmlFor="payments-unit-select" className="block text-sm font-medium text-content">
        Unit
      </label>
      <p className="mt-1 text-xs text-content-tertiary">
        Payments, statements, and exports are shown for the selected unit.
      </p>
      <select
        id="payments-unit-select"
        className="mt-3 w-full rounded-md border border-edge bg-surface-card px-3 py-2 text-sm text-content focus:border-interactive focus:outline-none focus:ring-1 focus:ring-interactive"
        value={selectedUnitId ?? ''}
        onChange={(event) => onSelect(Number(event.target.value))}
      >
        <option value="" disabled>
          Select a unit
        </option>
        {actorUnits.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.label}
          </option>
        ))}
      </select>
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
    red: 'border-status-danger-border bg-status-danger-bg',
    green: 'border-status-success-border bg-status-success-bg',
    yellow: 'border-status-warning-border bg-status-warning-bg',
    blue: 'border-status-info-border bg-interactive-subtle',
  };
  const textColors: Record<string, string> = {
    red: 'text-status-danger',
    green: 'text-status-success',
    yellow: 'text-status-warning',
    blue: 'text-interactive',
  };

  return (
    <div className={`rounded-md border p-4 ${colors[accent]}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-content-tertiary">{label}</p>
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
      className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium min-h-10 ${
        active
          ? 'border-interactive text-interactive'
          : 'border-transparent text-content-tertiary hover:border-edge-strong hover:text-content-secondary'
      }`}
    >
      {label}
      {count > 0 && (
        <span
          className={`ml-2 inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
            active ? 'bg-interactive-subtle text-interactive' : 'bg-surface-muted text-content-secondary'
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
      <div className="rounded-md border border-edge bg-surface-card p-8 text-center">
        <svg
          className="mx-auto h-10 w-10 text-status-success"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="mt-2 text-sm font-medium text-content">All caught up!</p>
        <p className="text-sm text-content-tertiary">You have no outstanding assessments.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-edge bg-surface-card">
      <table className="min-w-full divide-y divide-edge">
        <thead className="bg-surface-page">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Due Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Status</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-content-tertiary">Amount</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-content-tertiary">Late Fee</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-content-tertiary">Total</th>
            {canPay && <th className="px-4 py-3 text-right text-xs font-medium uppercase text-content-tertiary">Action</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-edge-subtle">
          {items.map((item) => {
            const totalCents = item.amountCents + item.lateFeeCents;
            return (
              <tr key={item.id} className="hover:bg-surface-hover">
                <td className="whitespace-nowrap px-4 py-3 text-sm text-content">{formatDate(item.dueDate)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={item.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-content">{formatCents(item.amountCents)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-content-tertiary">
                  {item.lateFeeCents > 0 ? formatCents(item.lateFeeCents) : '-'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-content">{formatCents(totalCents)}</td>
                {canPay && (
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      onClick={() => onPay(item)}
                      className="rounded-md bg-interactive px-3 py-2 text-xs font-medium text-content-inverse hover:bg-interactive-hover min-h-10"
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
        <p className="px-4 py-2 text-xs text-content-tertiary">
          Online payments include a small convenience fee.
        </p>
      )}
    </div>
  );
}

function PaymentHistory({ items }: { items: LineItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-edge bg-surface-card p-8 text-center">
        <p className="text-sm text-content-tertiary">No payment history yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-edge bg-surface-card">
      <table className="min-w-full divide-y divide-edge">
        <thead className="bg-surface-page">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Due Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Paid On</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-content-tertiary">Amount</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-content-tertiary">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge-subtle">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-surface-hover">
              <td className="whitespace-nowrap px-4 py-3 text-sm text-content">{formatDate(item.dueDate)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-content-secondary">
                {item.paidAt ? new Date(item.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-content">{formatCents(item.amountCents)}</td>
              <td className="px-4 py-3 text-right">
                <StatusBadge status="paid" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
