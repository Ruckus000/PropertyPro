'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AssessmentManager } from '@/components/finance/assessment-manager';
import { FinanceDashboard } from '@/components/finance/finance-dashboard';

type AdminPaymentsTab = 'overview' | 'assessments';

interface AdminPaymentsTabsProps {
  communityId: number;
  userId: string;
  userRole: string;
  initialTab?: string;
}

function coerceTab(value: string | undefined): AdminPaymentsTab {
  return value === 'assessments' ? 'assessments' : 'overview';
}

export function AdminPaymentsTabs({
  communityId,
  userId,
  userRole,
  initialTab,
}: AdminPaymentsTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = coerceTab(initialTab);

  function handleTabChange(nextValue: string) {
    const nextTab = coerceTab(nextValue);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', nextTab);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="assessments">Assessments</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'overview' ? (
        <FinanceDashboard
          communityId={communityId}
          userId={userId}
          userRole={userRole}
        />
      ) : (
        <AssessmentManager
          communityId={communityId}
          userId={userId}
          userRole={userRole}
        />
      )}
    </div>
  );
}
