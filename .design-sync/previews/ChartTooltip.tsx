import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@propertypro/design-system';

const requestConfig = {
  opened: { label: 'Opened', color: 'var(--interactive-primary)' },
  closed: { label: 'Closed', color: 'var(--status-success)' },
};

const requests = [
  { month: 'Jun', opened: 18, closed: 15 },
  { month: 'Jul', opened: 22, closed: 19 },
  { month: 'Aug', opened: 14, closed: 21 },
  { month: 'Sep', opened: 11, closed: 12 },
];

export const WithCursorHighlight = () => (
  <Card className="w-full max-w-xs">
    <CardHeader>
      <CardTitle>Record requests</CardTitle>
      <CardDescription>The cursor band marks the category being read</CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer config={requestConfig} className="h-64 w-full">
        <BarChart data={requests} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={28} />
          <ChartTooltip defaultIndex={1} content={<ChartTooltipContent />} />
          <Bar dataKey="opened" fill="var(--color-opened)" radius={4} isAnimationActive={false} />
          <Bar dataKey="closed" fill="var(--color-closed)" radius={4} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </CardContent>
  </Card>
);

export const CursorHidden = () => (
  <Card className="w-full max-w-xs">
    <CardHeader>
      <CardTitle>Record requests</CardTitle>
      <CardDescription>With cursor={'{false}'} only the readout moves</CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer config={requestConfig} className="h-64 w-full">
        <BarChart data={requests} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={28} />
          <ChartTooltip cursor={false} defaultIndex={1} content={<ChartTooltipContent />} />
          <Bar dataKey="opened" fill="var(--color-opened)" radius={4} isAnimationActive={false} />
          <Bar dataKey="closed" fill="var(--color-closed)" radius={4} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </CardContent>
  </Card>
);
