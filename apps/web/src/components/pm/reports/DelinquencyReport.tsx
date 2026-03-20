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
import { DollarSign, Home, Clock } from 'lucide-react';
import { delinquencyChartConfig } from './chart-configs';
import { usePmReport, type DelinquencyReportData, type ReportFilters } from '@/hooks/use-pm-reports';

interface DelinquencyReportProps {
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

export function DelinquencyReport({ filters, enabled }: DelinquencyReportProps) {
  const { data, isLoading, isError, refetch } = usePmReport<DelinquencyReportData>(
    'delinquency',
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
    '0-30 days': formatCurrency(r.days0to30),
    '31-60 days': formatCurrency(r.days31to60),
    '61-90 days': formatCurrency(r.days61to90),
    '90+ days': formatCurrency(r.days90plus),
    Total: formatCurrency(r.total),
    'Delinquent Units': r.delinquentUnits,
  }));

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          title={kpis.totalOutstanding.label}
          value={formatCurrency(Number(kpis.totalOutstanding.value))}
          delta={kpis.totalOutstanding.delta}
          trend={kpis.totalOutstanding.trend}
          invertTrend
          icon={DollarSign}
        />
        <KpiCard
          title={kpis.delinquentUnits.label}
          value={kpis.delinquentUnits.value}
          delta={kpis.delinquentUnits.delta}
          trend={kpis.delinquentUnits.trend}
          invertTrend
          icon={Home}
        />
        <KpiCard
          title={kpis.avgDaysOverdue.label}
          value={`${kpis.avgDaysOverdue.value}d`}
          delta={kpis.avgDaysOverdue.delta}
          trend={kpis.avgDaysOverdue.trend}
          invertTrend
          icon={Clock}
        />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Delinquency Aging by Community</CardTitle>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <ChartContainer config={delinquencyChartConfig} aria-label="Stacked horizontal bar chart showing delinquency aging buckets per community">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v: number) => formatCurrency(v)} />
                <YAxis dataKey="communityName" type="category" width={150} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar
                  dataKey="days0to30"
                  stackId="aging"
                  fill="var(--color-days0to30)"
                />
                <Bar
                  dataKey="days31to60"
                  stackId="aging"
                  fill="var(--color-days31to60)"
                />
                <Bar
                  dataKey="days61to90"
                  stackId="aging"
                  fill="var(--color-days61to90)"
                />
                <Bar
                  dataKey="days90plus"
                  stackId="aging"
                  fill="var(--color-days90plus)"
                  radius={[0, 4, 4, 0]}
                />
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
          <CardTitle>Delinquency by Community</CardTitle>
          <CsvExportButton
            headers={['Community', '0-30 days', '31-60 days', '61-90 days', '90+ days', 'Total', 'Delinquent Units']}
            rows={csvRows}
            filename="delinquency-report"
          />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Community</TableHead>
                <TableHead className="text-right">0-30d</TableHead>
                <TableHead className="text-right">31-60d</TableHead>
                <TableHead className="text-right">61-90d</TableHead>
                <TableHead className="text-right">90+d</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Units</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.map((row) => (
                <TableRow key={row.communityId}>
                  <TableCell className="font-medium">{row.communityName}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.days0to30)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.days31to60)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.days61to90)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.days90plus)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(row.total)}</TableCell>
                  <TableCell className="text-right">{row.delinquentUnits}</TableCell>
                </TableRow>
              ))}
              {tableData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No delinquency data available.
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
