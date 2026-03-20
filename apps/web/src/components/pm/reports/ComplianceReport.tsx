'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { KpiCard } from '@/components/shared/kpi-card';
import { ChartSkeleton } from '@/components/shared/chart-skeleton';
import { ChartEmptyState } from '@/components/shared/chart-empty-state';
import { CsvExportButton } from '@/components/shared/csv-export-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Shield, AlertTriangle, FileWarning } from 'lucide-react';
import { complianceChartConfig } from './chart-configs';
import { usePmReport, type ComplianceReportData, type ReportFilters } from '@/hooks/use-pm-reports';

interface ComplianceReportProps {
  filters: ReportFilters;
  enabled: boolean;
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  compliant: { label: 'Compliant', variant: 'default' },
  at_risk: { label: 'At Risk', variant: 'secondary' },
  non_compliant: { label: 'Non-Compliant', variant: 'destructive' },
};

export function ComplianceReport({ filters, enabled }: ComplianceReportProps) {
  const { data, isLoading, isError, refetch } = usePmReport<ComplianceReportData>(
    'compliance',
    filters,
    { enabled },
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard title="" value="" isLoading />
          <KpiCard title="" value="" isLoading />
          <KpiCard title="" value="" isLoading />
        </div>
        <ChartSkeleton />
      </div>
    );
  }

  if (isError || !data) {
    return <ChartEmptyState type="error" onRetry={() => refetch()} />;
  }

  const { kpis, chartData, tableData } = data;
  const hasData = chartData.length > 0;

  const csvRows = tableData.map((r) => ({
    Community: r.communityName,
    'Score (%)': r.score,
    Satisfied: r.satisfied,
    Overdue: r.overdue,
    Missing: r.missing,
    Status: r.status,
  }));

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          title={kpis.portfolioScore.label}
          value={`${kpis.portfolioScore.value}%`}
          delta={kpis.portfolioScore.delta}
          trend={kpis.portfolioScore.trend}
          icon={Shield}
        />
        <KpiCard
          title={kpis.atRisk.label}
          value={kpis.atRisk.value}
          delta={kpis.atRisk.delta}
          trend={kpis.atRisk.trend}
          invertTrend
          icon={AlertTriangle}
        />
        <KpiCard
          title={kpis.overdueDocuments.label}
          value={kpis.overdueDocuments.value}
          delta={kpis.overdueDocuments.delta}
          trend={kpis.overdueDocuments.trend}
          invertTrend
          icon={FileWarning}
        />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Compliance by Community</CardTitle>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <ChartContainer config={complianceChartConfig} aria-label="Grouped bar chart showing compliance status per community">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="communityName" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="satisfied" fill="var(--color-satisfied)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="overdue" fill="var(--color-overdue)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="missing" fill="var(--color-missing)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <ChartEmptyState type="empty" />
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Community Compliance Details</CardTitle>
          <CsvExportButton
            headers={['Community', 'Score (%)', 'Satisfied', 'Overdue', 'Missing', 'Status']}
            rows={csvRows}
            filename="compliance-report"
          />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Community</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Satisfied</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead className="text-right">Missing</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.map((row) => {
                const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.compliant!;
                return (
                  <TableRow key={row.communityId}>
                    <TableCell className="font-medium">{row.communityName}</TableCell>
                    <TableCell className="text-right">{row.score}%</TableCell>
                    <TableCell className="text-right">{row.satisfied}</TableCell>
                    <TableCell className="text-right">{row.overdue}</TableCell>
                    <TableCell className="text-right">{row.missing}</TableCell>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {tableData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No compliance data available.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
