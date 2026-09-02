import { Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis, YAxis } from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
} from '@propertypro/design-system';

const occupancyConfig = {
  units: { label: 'Units' },
  occupied: { label: 'Owner-occupied', color: 'var(--status-success)' },
  leased: { label: 'Leased', color: 'var(--interactive-primary)' },
  vacant: { label: 'Vacant', color: 'var(--status-neutral)' },
};

const occupancy = [
  { segment: 'occupied', units: 68, fill: 'var(--color-occupied)' },
  { segment: 'leased', units: 41, fill: 'var(--color-leased)' },
  { segment: 'vacant', units: 7, fill: 'var(--color-vacant)' },
];

export const LegendUnderDonut = () => (
  <Card className="w-full max-w-xs">
    <CardHeader>
      <CardTitle>Occupancy mix</CardTitle>
      <CardDescription>Sunset Condos · 116 units</CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer config={occupancyConfig} className="h-64 w-full">
        <PieChart>
          <Pie
            data={occupancy}
            dataKey="units"
            nameKey="segment"
            innerRadius={48}
            outerRadius={76}
            strokeWidth={2}
            isAnimationActive={false}
          />
          <ChartLegend content={<ChartLegendContent nameKey="segment" />} />
        </PieChart>
      </ChartContainer>
    </CardContent>
  </Card>
);

const noticeConfig = {
  onTime: { label: 'On time', color: 'var(--status-success)' },
  late: { label: 'Late', color: 'var(--status-danger)' },
};

const notices = [
  { quarter: 'Q1', onTime: 11, late: 1 },
  { quarter: 'Q2', onTime: 13, late: 0 },
  { quarter: 'Q3', onTime: 9, late: 2 },
];

export const LegendAboveBars = () => (
  <Card className="w-full max-w-xs">
    <CardHeader>
      <CardTitle>Meeting notices</CardTitle>
      <CardDescription>14-day and 48-hour windows</CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer config={noticeConfig} className="h-64 w-full">
        <BarChart data={notices} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="quarter" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={28} />
          <ChartLegend verticalAlign="top" content={<ChartLegendContent />} />
          <Bar dataKey="onTime" fill="var(--color-onTime)" radius={4} isAnimationActive={false} />
          <Bar dataKey="late" fill="var(--color-late)" radius={4} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </CardContent>
  </Card>
);
