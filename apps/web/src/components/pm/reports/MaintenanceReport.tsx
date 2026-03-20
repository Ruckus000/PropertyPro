'use client';

import {
  AreaChart,
  Area,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Wrench, Clock, AlertCircle } from 'lucide-react';
import { maintenanceChartConfig } from './chart-configs';
import { usePmReport, type MaintenanceReportData, type ReportFilters } from '@/hooks/use-pm-reports';

interface MaintenanceReportProps {
  filters: ReportFilters;
  enabled: boolean;
}

export function MaintenanceReport({ filters, enabled }: MaintenanceReportProps) {
  const { data, isLoading, isError, refetch } = usePmReport<MaintenanceReportData>(
    'maintenance',
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
    Total: r.total,
    Open: r.open,
    'Avg Resolution (days)': r.avgResolutionDays,
    'Longest Open (days)': r.longestOpenDays,
  }));

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          title={kpis.totalRequests.label}
          value={kpis.totalRequests.value}
          delta={kpis.totalRequests.delta}
          trend={kpis.totalRequests.trend}
          icon={Wrench}
        />
        <KpiCard
          title={kpis.avgResolution.label}
          value={`${kpis.avgResolution.value}d`}
          delta={kpis.avgResolution.delta}
          trend={kpis.avgResolution.trend}
          invertTrend
          icon={Clock}
        />
        <KpiCard
          title={kpis.openRequests.label}
          value={kpis.openRequests.value}
          delta={kpis.openRequests.delta}
          trend={kpis.openRequests.trend}
          invertTrend
          icon={AlertCircle}
        />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Maintenance Volume Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <ChartContainer config={maintenanceChartConfig} aria-label="Stacked area chart showing maintenance request volumes over time">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area
                  type="monotone"
                  dataKey="resolved"
                  stackId="1"
                  fill="var(--color-resolved)"
                  stroke="var(--color-resolved)"
                  fillOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="inProgress"
                  stackId="1"
                  fill="var(--color-inProgress)"
                  stroke="var(--color-inProgress)"
                  fillOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="open"
                  stackId="1"
                  fill="var(--color-open)"
                  stroke="var(--color-open)"
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <ChartEmptyState type="empty" />
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>By Community</CardTitle>
          <CsvExportButton
            headers={['Community', 'Total', 'Open', 'Avg Resolution (days)', 'Longest Open (days)']}
            rows={csvRows}
            filename="maintenance-report"
          />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Community</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Open</TableHead>
                <TableHead className="text-right">Avg Resolution</TableHead>
                <TableHead className="text-right">Longest Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.map((row) => (
                <TableRow key={row.communityId}>
                  <TableCell className="font-medium">{row.communityName}</TableCell>
                  <TableCell className="text-right">{row.total}</TableCell>
                  <TableCell className="text-right">{row.open}</TableCell>
                  <TableCell className="text-right">{row.avgResolutionDays}d</TableCell>
                  <TableCell className="text-right">{row.longestOpenDays}d</TableCell>
                </TableRow>
              ))}
              {tableData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No maintenance data available.
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
