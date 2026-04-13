'use client';

import { useCallback, useMemo, useState, startTransition, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReportFilters, parseReportFilters } from './ReportFilters';
import { ReportTabSkeleton } from './ReportTabSkeleton';
import { PageHeader } from '@/components/shared/page-header';
import { getPmReportQueryOptions, type ReportFilters as ReportFilterValues, type ReportType } from '@/hooks/use-pm-reports';

interface Community {
  communityId: number;
  communityName: string;
}

interface PmReportsClientProps {
  communities: Community[];
}

interface ReportPanelProps {
  filters: ReportFilterValues;
  enabled: boolean;
}

const DEFAULT_REPORT_TAB: ReportType = 'maintenance';

const loadMaintenanceReport = () =>
  import('./MaintenanceReport').then((module) => module.MaintenanceReport);
const loadComplianceReport = () =>
  import('./ComplianceReport').then((module) => module.ComplianceReport);
const loadOccupancyReport = () =>
  import('./OccupancyReport').then((module) => module.OccupancyReport);
const loadViolationReport = () =>
  import('./ViolationReport').then((module) => module.ViolationReport);
const loadDelinquencyReport = () =>
  import('./DelinquencyReport').then((module) => module.DelinquencyReport);

const REPORT_COMPONENT_PRELOADERS: Record<
  ReportType,
  () => Promise<ComponentType<ReportPanelProps>>
> = {
  maintenance: loadMaintenanceReport,
  compliance: loadComplianceReport,
  occupancy: loadOccupancyReport,
  violations: loadViolationReport,
  delinquency: loadDelinquencyReport,
};

const REPORT_COMPONENTS: Record<ReportType, ComponentType<ReportPanelProps>> = {
  maintenance: dynamic(loadMaintenanceReport, {
    loading: () => <ReportTabSkeleton />,
  }),
  compliance: dynamic(loadComplianceReport, {
    loading: () => <ReportTabSkeleton />,
  }),
  occupancy: dynamic(loadOccupancyReport, {
    loading: () => <ReportTabSkeleton />,
  }),
  violations: dynamic(loadViolationReport, {
    loading: () => <ReportTabSkeleton />,
  }),
  delinquency: dynamic(loadDelinquencyReport, {
    loading: () => <ReportTabSkeleton />,
  }),
};

const TABS: { value: ReportType; label: string }[] = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'occupancy', label: 'Occupancy' },
  { value: 'violations', label: 'Violations' },
  { value: 'delinquency', label: 'Delinquency' },
];

export function PmReportsClient({ communities }: PmReportsClientProps) {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ReportType>(DEFAULT_REPORT_TAB);

  const filters = useMemo(
    () => parseReportFilters(searchParams),
    [searchParams],
  );

  const ActiveReport = REPORT_COMPONENTS[activeTab];

  const handleTabChange = useCallback((value: string) => {
    const nextTab = value as ReportType;
    if (nextTab === activeTab) {
      return;
    }

    void REPORT_COMPONENT_PRELOADERS[nextTab]();
    void queryClient.prefetchQuery(getPmReportQueryOptions(nextTab, filters));

    startTransition(() => {
      setActiveTab(nextTab);
    });
  }, [activeTab, filters, queryClient]);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Portfolio analytics & reports" />

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
        <ReportFilters communities={communities} />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <ActiveReport filters={filters} enabled />
        </TabsContent>
      </Tabs>
    </div>
  );
}
