'use client';

import { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReportFilters, parseReportFilters } from './ReportFilters';
import { MaintenanceReport } from './MaintenanceReport';
import { ComplianceReport } from './ComplianceReport';
import { OccupancyReport } from './OccupancyReport';
import { ViolationReport } from './ViolationReport';
import { DelinquencyReport } from './DelinquencyReport';
import type { ReportType } from '@/hooks/use-pm-reports';

interface Community {
  communityId: number;
  communityName: string;
}

interface PmReportsClientProps {
  communities: Community[];
}

const TABS: { value: ReportType; label: string }[] = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'occupancy', label: 'Occupancy' },
  { value: 'violations', label: 'Violations' },
  { value: 'delinquency', label: 'Delinquency' },
];

export function PmReportsClient({ communities }: PmReportsClientProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<ReportType>('maintenance');

  const filters = useMemo(
    () => parseReportFilters(searchParams),
    [searchParams],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
          <p className="mt-1 text-sm text-gray-500">
            Cross-portfolio analytics and exportable reports
          </p>
        </div>
        <ReportFilters communities={communities} />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReportType)}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="maintenance" className="mt-6">
          <MaintenanceReport filters={filters} enabled={activeTab === 'maintenance'} />
        </TabsContent>

        <TabsContent value="compliance" className="mt-6">
          <ComplianceReport filters={filters} enabled={activeTab === 'compliance'} />
        </TabsContent>

        <TabsContent value="occupancy" className="mt-6">
          <OccupancyReport filters={filters} enabled={activeTab === 'occupancy'} />
        </TabsContent>

        <TabsContent value="violations" className="mt-6">
          <ViolationReport filters={filters} enabled={activeTab === 'violations'} />
        </TabsContent>

        <TabsContent value="delinquency" className="mt-6">
          <DelinquencyReport filters={filters} enabled={activeTab === 'delinquency'} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
