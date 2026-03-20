'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
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
import { Users, Home, Calendar } from 'lucide-react';
import { buildOccupancyChartConfig } from './chart-configs';
import { usePmReport, type OccupancyReportData, type ReportFilters } from '@/hooks/use-pm-reports';

interface OccupancyReportProps {
  filters: ReportFilters;
  enabled: boolean;
}

export function OccupancyReport({ filters, enabled }: OccupancyReportProps) {
  const { data, isLoading, isError, refetch } = usePmReport<OccupancyReportData>(
    'occupancy',
    filters,
    { enabled },
  );

  const chartConfig = useMemo(
    () => buildOccupancyChartConfig(data?.communityNames ?? []),
    [data?.communityNames],
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

  const { kpis, chartData, tableData, communityNames } = data;
  const hasData = chartData.length > 0;

  const csvRows = tableData.map((r) => ({
    Community: r.communityName,
    'Total Units': r.totalUnits,
    Occupied: r.occupied,
    Vacant: r.vacant,
    'Rate (%)': r.rate,
    'Expiring Leases': r.expiringLeases,
  }));

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          title={kpis.currentOccupancy.label}
          value={`${kpis.currentOccupancy.value}%`}
          delta={kpis.currentOccupancy.delta}
          trend={kpis.currentOccupancy.trend}
          icon={Users}
        />
        <KpiCard
          title={kpis.vacantUnits.label}
          value={kpis.vacantUnits.value}
          delta={kpis.vacantUnits.delta}
          trend={kpis.vacantUnits.trend}
          invertTrend
          icon={Home}
        />
        <KpiCard
          title={kpis.expiringLeases.label}
          value={kpis.expiringLeases.value}
          delta={kpis.expiringLeases.delta}
          trend={kpis.expiringLeases.trend}
          icon={Calendar}
        />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Occupancy Trends</CardTitle>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <ChartContainer config={chartConfig} aria-label="Multi-series line chart showing occupancy trends per community over time">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis domain={[0, 100]} unit="%" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                {communityNames.map((name) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={`var(--color-${name.replace(/\s/g, '-')})`}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ChartContainer>
          ) : (
            <ChartEmptyState type="empty" />
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Community Occupancy Details</CardTitle>
          <CsvExportButton
            headers={['Community', 'Total Units', 'Occupied', 'Vacant', 'Rate (%)', 'Expiring Leases']}
            rows={csvRows}
            filename="occupancy-report"
          />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Community</TableHead>
                <TableHead className="text-right">Total Units</TableHead>
                <TableHead className="text-right">Occupied</TableHead>
                <TableHead className="text-right">Vacant</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Expiring</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.map((row) => (
                <TableRow key={row.communityId}>
                  <TableCell className="font-medium">{row.communityName}</TableCell>
                  <TableCell className="text-right">{row.totalUnits}</TableCell>
                  <TableCell className="text-right">{row.occupied}</TableCell>
                  <TableCell className="text-right">{row.vacant}</TableCell>
                  <TableCell className="text-right">{row.rate}%</TableCell>
                  <TableCell className="text-right">{row.expiringLeases}</TableCell>
                </TableRow>
              ))}
              {tableData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No occupancy data available.
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
