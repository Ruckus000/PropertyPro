import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@propertypro/design-system';

const violationConfig = {
  opened: { label: 'Opened', color: 'var(--status-danger)' },
  cured: { label: 'Cured', color: 'var(--status-success)' },
};

const violations = [
  { month: 'April', opened: 14, cured: 11 },
  { month: 'May', opened: 9, cured: 13 },
  { month: 'June', opened: 17, cured: 12 },
  { month: 'July', opened: 12, cured: 16 },
  { month: 'August', opened: 8, cured: 15 },
  { month: 'September', opened: 11, cured: 9 },
];

export const DotIndicator = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Violation activity</CardTitle>
      <CardDescription>
        The readout takes each series label from the chart config and right-aligns the value
      </CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer config={violationConfig} className="h-72 w-full">
        <BarChart data={violations} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={40} />
          <ChartTooltip
            defaultIndex={3}
            content={<ChartTooltipContent className="w-48" indicator="dot" />}
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="opened" fill="var(--color-opened)" radius={4} isAnimationActive={false} />
          <Bar dataKey="cured" fill="var(--color-cured)" radius={4} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </CardContent>
  </Card>
);

const workOrderConfig = {
  open: { label: 'Open', color: 'var(--status-danger)' },
  inProgress: { label: 'In progress', color: 'var(--status-warning)' },
  resolved: { label: 'Resolved', color: 'var(--status-success)' },
};

const workOrders = [
  { week: 'Wk 27', open: 12, inProgress: 9, resolved: 18 },
  { week: 'Wk 28', open: 15, inProgress: 11, resolved: 22 },
  { week: 'Wk 29', open: 9, inProgress: 14, resolved: 26 },
  { week: 'Wk 30', open: 7, inProgress: 10, resolved: 31 },
  { week: 'Wk 31', open: 11, inProgress: 8, resolved: 24 },
  { week: 'Wk 32', open: 6, inProgress: 7, resolved: 29 },
];

export const LineIndicator = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Maintenance throughput</CardTitle>
      <CardDescription>
        A line indicator suits stacked areas, where a dot would sit off the band it names
      </CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer config={workOrderConfig} className="h-72 w-full">
        <AreaChart data={workOrders} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={40} />
          <ChartTooltip
            defaultIndex={2}
            content={<ChartTooltipContent className="w-48" indicator="line" />}
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Area dataKey="resolved" stackId="a" stroke="var(--color-resolved)" fill="var(--color-resolved)" isAnimationActive={false} />
          <Area dataKey="inProgress" stackId="a" stroke="var(--color-inProgress)" fill="var(--color-inProgress)" isAnimationActive={false} />
          <Area dataKey="open" stackId="a" stroke="var(--color-open)" fill="var(--color-open)" isAnimationActive={false} />
        </AreaChart>
      </ChartContainer>
    </CardContent>
  </Card>
);

const collectionsConfig = {
  collected: { label: 'Collected', color: 'var(--status-success)' },
  outstanding: { label: 'Outstanding', color: 'var(--status-warning)' },
};

const collections = [
  { month: 'April', collected: 128400, outstanding: 9600 },
  { month: 'May', collected: 131200, outstanding: 6800 },
  { month: 'June', collected: 126900, outstanding: 11100 },
  { month: 'July', collected: 134500, outstanding: 3500 },
  { month: 'August', collected: 129750, outstanding: 8250 },
  { month: 'September', collected: 118300, outstanding: 19700 },
];

const usd = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

export const CurrencyFormatter = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Assessment collections</CardTitle>
      <CardDescription>
        A formatter takes over the row so money is rendered as currency, not a bare number
      </CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer config={collectionsConfig} className="h-72 w-full">
        <BarChart data={collections} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value: number) => '$' + Math.round(value / 1000) + 'k'}
          />
          <ChartTooltip
            defaultIndex={3}
            content={
              <ChartTooltipContent
                className="w-52"
                formatter={(value, name, item) => (
                  <>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: item.color }}
                    />
                    <div className="flex flex-1 items-center justify-between gap-4">
                      <span className="text-content-secondary">
                        {collectionsConfig[name as 'collected' | 'outstanding'].label}
                      </span>
                      <span className="font-medium tabular-nums">{usd(Number(value))}</span>
                    </div>
                  </>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="collected" fill="var(--color-collected)" radius={4} isAnimationActive={false} />
          <Bar dataKey="outstanding" fill="var(--color-outstanding)" radius={4} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </CardContent>
  </Card>
);
