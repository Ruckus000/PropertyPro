import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
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

const reserves = [
  { component: 'Roof', funded: 412, target: 486 },
  { component: 'Elevator', funded: 188, target: 240 },
  { component: 'Paint', funded: 96, target: 96 },
  { component: 'Pool deck', funded: 41, target: 62 },
];

// ChartStyle turns each config entry's `color` into a --color-<key> custom
// property scoped to this chart. The marks below never name a colour: they
// reference var(--color-funded) / var(--color-target), so re-pointing the
// config recolours the whole chart.
const statusConfig = {
  funded: { label: 'Funded to date', color: 'var(--status-success)' },
  target: { label: 'Fully funded target', color: 'var(--status-neutral)' },
};

const brandConfig = {
  funded: { label: 'Funded to date', color: 'var(--interactive-primary)' },
  target: { label: 'Fully funded target', color: 'var(--status-info)' },
};

const ReserveChart = ({ config }: { config: typeof statusConfig }) => (
  <ChartContainer config={config} className="h-64 w-full">
    <BarChart data={reserves} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
      <CartesianGrid vertical={false} strokeDasharray="3 3" />
      <XAxis dataKey="component" tickLine={false} axisLine={false} tickMargin={8} />
      <YAxis
        tickLine={false}
        axisLine={false}
        width={60}
        tickFormatter={(value: number) => '$' + value + 'k'}
      />
      <ChartLegend content={<ChartLegendContent />} />
      <Bar dataKey="funded" fill="var(--color-funded)" radius={4} isAnimationActive={false} />
      <Bar dataKey="target" fill="var(--color-target)" radius={4} isAnimationActive={false} />
    </BarChart>
  </ChartContainer>
);

export const StatusPalette = () => (
  <Card className="w-full max-w-xs">
    <CardHeader>
      <CardTitle>Reserve funding</CardTitle>
      <CardDescription>Series mapped to the status scale</CardDescription>
    </CardHeader>
    <CardContent>
      <ReserveChart config={statusConfig} />
    </CardContent>
  </Card>
);

export const BrandPalette = () => (
  <Card className="w-full max-w-xs">
    <CardHeader>
      <CardTitle>Reserve funding</CardTitle>
      <CardDescription>Same marks, config re-pointed at the brand tokens</CardDescription>
    </CardHeader>
    <CardContent>
      <ReserveChart config={brandConfig} />
    </CardContent>
  </Card>
);
