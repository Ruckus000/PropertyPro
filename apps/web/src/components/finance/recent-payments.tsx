'use client';

import { useRecentPayments } from '@/hooks/use-finance';

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

/* ─────── Component ─────── */

/**
 * Recent payments, newest first. Extracted verbatim from the old
 * finance-dashboard.tsx so the flat Payments switcher can place it on the
 * Overview view — the design prototype (pp-money.js) shows recent payments
 * on the overview rather than behind a tab of their own.
 *
 * Shares `useRecentPayments` with FinanceKpiRow's "Collected This Month", so
 * on the overview the two read one request.
 */
export function RecentPayments({ communityId }: { communityId: number }) {
  const { data: items, isLoading: loading } = useRecentPayments(communityId);

  if (loading) {
    return <div className="h-48 animate-pulse rounded-md bg-surface-muted" />;
  }

  if (!items || items.length === 0) {
    return (
      <div className="rounded-md border border-edge bg-surface-card p-8 text-center">
        <p className="text-sm text-content-tertiary">No payments received yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-edge bg-surface-card">
      <table className="min-w-full divide-y divide-edge">
        <thead className="bg-surface-page">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Unit</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Paid On</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-content-tertiary">Amount</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-content-tertiary">Late Fee</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge-subtle">
          {items.slice(0, 25).map((item) => (
            <tr key={item.id} className="hover:bg-surface-hover">
              <td className="whitespace-nowrap px-4 py-3 text-sm text-content">Unit #{item.unitId}</td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-content-secondary">
                {item.paidAt ? formatDateTime(item.paidAt) : '-'}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-content">
                {formatCents(item.amountCents)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-content-tertiary">
                {item.lateFeeCents > 0 ? formatCents(item.lateFeeCents) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
