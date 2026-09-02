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

const complianceConfig = {
  satisfied: { label: 'Satisfied', color: 'var(--status-success)' },
  overdue: { label: 'Overdue', color: 'var(--status-warning)' },
  missing: { label: 'Missing', color: 'var(--status-danger)' },
};

const compliance = [
  { requirement: 'Governing docs', satisfied: 11, overdue: 1, missing: 0 },
  { requirement: 'Financials', satisfied: 8, overdue: 2, missing: 1 },
  { requirement: 'Meeting notices', satisfied: 14, overdue: 0, missing: 0 },
  { requirement: 'Insurance', satisfied: 5, overdue: 1, missing: 2 },
  { requirement: 'Structural (SIRS)', satisfied: 3, overdue: 2, missing: 1 },
];

export const LegendBelowChart = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Record posting by requirement</CardTitle>
      <CardDescription>
        Sunset Condos · §718.111(12)(g) record categories, September 2026
      </CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer config={complianceConfig} className="h-72 w-full">
        <BarChart data={compliance} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="requirement" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={32} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="satisfied" stackId="a" fill="var(--color-satisfied)" isAnimationActive={false} />
          <Bar dataKey="overdue" stackId="a" fill="var(--color-overdue)" isAnimationActive={false} />
          <Bar dataKey="missing" stackId="a" fill="var(--color-missing)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </CardContent>
  </Card>
);

export const LegendAboveChart = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Record posting by requirement</CardTitle>
      <CardDescription>
        Placing the key above the plot keeps it next to the title when the chart is read first
      </CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer config={complianceConfig} className="h-72 w-full">
        <BarChart data={compliance} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="requirement" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={32} />
          <ChartLegend verticalAlign="top" content={<ChartLegendContent />} />
          <Bar dataKey="satisfied" stackId="a" fill="var(--color-satisfied)" isAnimationActive={false} />
          <Bar dataKey="overdue" stackId="a" fill="var(--color-overdue)" isAnimationActive={false} />
          <Bar dataKey="missing" stackId="a" fill="var(--color-missing)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </CardContent>
  </Card>
);

// Aging buckets escalate, so the ramp runs green -> gold -> orange -> red; the
// token layer has a status scale but no categorical one, hence the two palette
// ramp variables in the middle.
const agingConfig = {
  days0to30: { label: '0-30 days', color: 'var(--status-success)' },
  days31to60: { label: '31-60 days', color: 'var(--gold-500)' },
  days61to90: { label: '61-90 days', color: 'var(--orange-600)' },
  days90plus: { label: '90+ days', color: 'var(--status-danger)' },
};

const aging = [
  { month: 'May', days0to30: 7210, days31to60: 3980, days61to90: 2110, days90plus: 6420 },
  { month: 'June', days0to30: 8140, days31to60: 4260, days61to90: 3050, days90plus: 7180 },
  { month: 'July', days0to30: 7690, days31to60: 5120, days61to90: 4470, days90plus: 8240 },
  { month: 'August', days0to30: 8412, days31to60: 5180, days61to90: 6247, days90plus: 9533 },
];

export const FourSeriesLegend = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Receivables aging</CardTitle>
      <CardDescription>
        Four buckets stay on one row; the key is what makes an escalating ramp readable
      </CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer config={agingConfig} className="h-72 w-full">
        <BarChart data={aging} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value: number) => '$' + Math.round(value / 1000) + 'k'}
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="days0to30" stackId="a" fill="var(--color-days0to30)" isAnimationActive={false} />
          <Bar dataKey="days31to60" stackId="a" fill="var(--color-days31to60)" isAnimationActive={false} />
          <Bar dataKey="days61to90" stackId="a" fill="var(--color-days61to90)" isAnimationActive={false} />
          <Bar dataKey="days90plus" stackId="a" fill="var(--color-days90plus)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </CardContent>
  </Card>
);
