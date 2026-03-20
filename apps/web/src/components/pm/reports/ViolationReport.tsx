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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, AlertCircle, DollarSign } from 'lucide-react';
import { violationChartConfig } from './chart-configs';
import { usePmReport, type ViolationReportData, type ReportFilters } from '@/hooks/use-pm-reports';

interface ViolationReportProps {
  filters: ReportFilters;
  enabled: boolean;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function ViolationReport({ filters, enabled }: ViolationReportProps) {
  const { data, isLoading, isError, refetch } = usePmReport<ViolationReportData>(
    'violations',
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
    Fined: r.fined,
    Resolved: r.resolved,
    'Total Fines': formatCurrency(r.totalFines),
  }));

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          title={kpis.totalViolations.label}
          value={kpis.totalViolations.value}
          delta={kpis.totalViolations.delta}
          trend={kpis.totalViolations.trend}
          invertTrend
          icon={AlertTriangle}
        />
        <KpiCard
          title={kpis.openViolations.label}
          value={kpis.openViolations.value}
          delta={kpis.openViolations.delta}
          trend={kpis.openViolations.trend}
          invertTrend
          icon={AlertCircle}
        />
        <KpiCard
          title={kpis.totalFines.label}
          value={formatCurrency(Number(kpis.totalFines.value))}
          delta={kpis.totalFines.delta}
          trend={kpis.totalFines.trend}
          icon={DollarSign}
        />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Violations by Community</CardTitle>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <ChartContainer config={violationChartConfig} aria-label="Horizontal bar chart showing violation breakdown per community">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="communityName" type="category" width={150} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="open" fill="var(--color-open)" radius={[0, 4, 4, 0]} />
                <Bar dataKey="fined" fill="var(--color-fined)" radius={[0, 4, 4, 0]} />
                <Bar dataKey="resolved" fill="var(--color-resolved)" radius={[0, 4, 4, 0]} />
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
          <CardTitle>Community Violation Details</CardTitle>
          <CsvExportButton
            headers={['Community', 'Total', 'Open', 'Fined', 'Resolved', 'Total Fines']}
            rows={csvRows}
            filename="violation-report"
          />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Community</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Open</TableHead>
                <TableHead className="text-right">Fined</TableHead>
                <TableHead className="text-right">Resolved</TableHead>
                <TableHead className="text-right">Fines</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.map((row) => (
                <TableRow key={row.communityId}>
                  <TableCell className="font-medium">{row.communityName}</TableCell>
                  <TableCell className="text-right">{row.total}</TableCell>
                  <TableCell className="text-right">{row.open}</TableCell>
                  <TableCell className="text-right">{row.fined}</TableCell>
                  <TableCell className="text-right">{row.resolved}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.totalFines)}</TableCell>
                </TableRow>
              ))}
              {tableData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No violation data available.
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
