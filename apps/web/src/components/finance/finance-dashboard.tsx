'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FinanceKpiRow } from './finance-kpi-row';
import { AssessmentManager } from './assessment-manager';
import { LedgerTable } from './ledger-table';
import { DelinquencyTable } from './delinquency-table';
import { useRecentPayments } from '@/hooks/use-finance';

/* ─────── Types ─────── */

type FinanceTab = 'assessments' | 'delinquency' | 'ledger' | 'payments';

export function parseFinanceDashboardTab(raw: unknown): FinanceTab {
  if (typeof raw === 'string' && ['assessments', 'delinquency', 'ledger', 'payments'].includes(raw)) {
    return raw as FinanceTab;
  }
  return 'assessments';
}

interface FinanceDashboardProps {
  communityId: number;
  userId: string;
  userRole: string;
}
/* ─────── Helpers ─────── */

function financeTabVisitedFlags(tab: FinanceTab): Record<FinanceTab, boolean> {
  return {
    assessments: tab === 'assessments',
    delinquency: tab === 'delinquency',
    ledger: tab === 'ledger',
    payments: tab === 'payments',
  };
}

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

/* ─────── Main Component ─────── */

export function FinanceDashboard({
  communityId,
  userId,
  userRole,
}: FinanceDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get('tab');
  const tabFromUrl = useMemo(
    () => parseFinanceDashboardTab(rawTab),
    [rawTab],
  );

  const [activeTab, setActiveTab] = useState<FinanceTab>(tabFromUrl);
  const [visitedTabs, setVisitedTabs] = useState<Record<FinanceTab, boolean>>(() =>
    financeTabVisitedFlags(tabFromUrl),
  );

  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  useEffect(() => {
    setVisitedTabs((current) =>
      current[tabFromUrl] ? current : { ...current, [tabFromUrl]: true },
    );
  }, [tabFromUrl]);

  const handleTabChange = (value: string) => {
    const nextTab = value as FinanceTab;
    setActiveTab(nextTab);
    setVisitedTabs((current) =>
      current[nextTab] ? current : { ...current, [nextTab]: true },
    );
    router.replace(`${pathname}?tab=${nextTab}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <FinanceKpiRow
        communityId={communityId}
        delinquencyEnabled={visitedTabs.delinquency}
      />

      {/* Tabbed Content */}
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="assessments">Assessments</TabsTrigger>
          <TabsTrigger value="delinquency">Delinquency</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="payments">Recent Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="assessments">
          {activeTab === 'assessments' && visitedTabs.assessments ? (
            <AssessmentManager
              communityId={communityId}
              userId={userId}
              userRole={userRole}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="delinquency">
          {activeTab === 'delinquency' && visitedTabs.delinquency ? (
            <DelinquencyTable communityId={communityId} />
          ) : null}
        </TabsContent>

        <TabsContent value="ledger">
          {activeTab === 'ledger' && visitedTabs.ledger ? (
            <LedgerTable communityId={communityId} />
          ) : null}
        </TabsContent>

        <TabsContent value="payments">
          {activeTab === 'payments' && visitedTabs.payments ? (
            <RecentPayments communityId={communityId} />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─────── Recent Payments (kept from original) ─────── */

function RecentPayments({ communityId }: { communityId: number }) {
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
