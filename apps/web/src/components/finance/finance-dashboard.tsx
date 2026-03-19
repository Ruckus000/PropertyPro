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
    return <div className="h-48 animate-pulse rounded-lg bg-gray-200" />;
  }

  if (!items || items.length === 0) {
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
