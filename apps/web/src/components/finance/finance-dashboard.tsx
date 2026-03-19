'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FinanceKpiRow } from './finance-kpi-row';
import { AssessmentManager } from './assessment-manager';
import { LedgerTable } from './ledger-table';
import { DelinquencyTable } from './delinquency-table';

/* ─────── Types ─────── */

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

/* ─────── Fetch ─────── */

async function fetchPaymentHistory(communityId: number): Promise<PaymentHistoryItem[]> {
  const res = await fetch(`/api/v1/payments/history?communityId=${communityId}`);
  if (!res.ok) throw new Error('Failed to load payment history');
  const json = await res.json();
  return json.data;
}

/* ─────── Main Component ─────── */

export function FinanceDashboard({ communityId, userId, userRole }: FinanceDashboardProps) {
  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <FinanceKpiRow communityId={communityId} />

      {/* Tabbed Content */}
      <Tabs defaultValue="assessments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="assessments">Assessments</TabsTrigger>
          <TabsTrigger value="delinquency">Delinquency</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="payments">Recent Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="assessments">
          <AssessmentManager
            communityId={communityId}
            userId={userId}
            userRole={userRole}
          />
        </TabsContent>

        <TabsContent value="delinquency">
          <DelinquencyTable communityId={communityId} />
        </TabsContent>

        <TabsContent value="ledger">
          <LedgerTable communityId={communityId} />
        </TabsContent>

        <TabsContent value="payments">
          <RecentPayments communityId={communityId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─────── Recent Payments (kept from original) ─────── */

function RecentPayments({ communityId }: { communityId: number }) {
  const { data: items, isLoading: loading } = useQuery({
    queryKey: ['finance-payments', communityId],
    queryFn: () => fetchPaymentHistory(communityId),
    staleTime: 30_000,
  });

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
