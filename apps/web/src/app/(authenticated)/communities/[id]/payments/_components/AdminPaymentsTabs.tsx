'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AssessmentManager } from '@/components/finance/assessment-manager';
import { DelinquencyTable } from '@/components/finance/delinquency-table';
import { FinanceKpiRow } from '@/components/finance/finance-kpi-row';
import { LedgerTable } from '@/components/finance/ledger-table';
import { RecentPayments } from '@/components/finance/recent-payments';

/**
 * One switcher over four readings of one ledger.
 *
 * This used to be two levels: "Overview | Assessments" here, and
 * "Assessments | Delinquency | Ledger | Recent Payments" again inside
 * Overview — "Assessments" twice meaning the same thing, both levels reading
 * the same `?tab=` param, and the inner Assessments tab unmounting the whole
 * dashboard because the outer level claimed that value first. Flattened per
 * the design prototype (pp-money.js): Overview / Assessments / Delinquency /
 * Ledger, with recent payments on the overview.
 */
type AdminPaymentsTab = 'overview' | 'assessments' | 'delinquency' | 'ledger';

const TABS: ReadonlyArray<{ value: AdminPaymentsTab; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'assessments', label: 'Assessments' },
  { value: 'delinquency', label: 'Delinquency' },
  { value: 'ledger', label: 'Ledger' },
];

/**
 * `payments` was the retired inner tab for recent payments, which now live on
 * the overview — old links keep landing somewhere sensible. Anything else
 * unknown is the overview too.
 */
function coercePaymentsTab(value: string | null): AdminPaymentsTab {
  switch (value) {
    case 'assessments':
    case 'delinquency':
    case 'ledger':
      return value;
    default:
      return 'overview';
  }
}

interface AdminPaymentsTabsProps {
  communityId: number;
  userId: string;
  userRole: string;
}

export function AdminPaymentsTabs({ communityId, userId, userRole }: AdminPaymentsTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = coercePaymentsTab(searchParams.get('tab'));

  function handleTabChange(nextValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', coercePaymentsTab(nextValue));
    // `replace`, not `push`: Back should leave the page, not walk every view.
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Only the active view mounts: a cold entry on Ledger fetches the ledger
          and nothing else. The overview enables the delinquency KPIs outright —
          an overview that reads "--" for overdue is not an overview. */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <FinanceKpiRow communityId={communityId} delinquencyEnabled />
          <RecentPayments communityId={communityId} />
        </div>
      )}
      {activeTab === 'assessments' && (
        <AssessmentManager communityId={communityId} userId={userId} userRole={userRole} />
      )}
      {activeTab === 'delinquency' && <DelinquencyTable communityId={communityId} />}
      {activeTab === 'ledger' && <LedgerTable communityId={communityId} />}
    </div>
  );
}
