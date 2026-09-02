import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
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

// Series colours resolve through the token layer: ChartStyle turns each entry's
// `color` into a --color-<key> custom property scoped to this chart, which the
// marks then reference as fill/stroke.
const collectionsConfig = {
  collected: { label: 'Collected', color: 'var(--status-success)' },
  outstanding: { label: 'Outstanding', color: 'var(--status-warning)' },
};

const collections = [
  { month: 'Apr', collected: 128400, outstanding: 9600 },
  { month: 'May', collected: 131200, outstanding: 6800 },
  { month: 'Jun', collected: 126900, outstanding: 11100 },
  { month: 'Jul', collected: 134500, outstanding: 3500 },
  { month: 'Aug', collected: 129750, outstanding: 8250 },
  { month: 'Sep', collected: 118300, outstanding: 19700 },
];

export const AssessmentCollections = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Assessment collections</CardTitle>
      <CardDescription>Sunset Condos · regular assessments, April – September 2026</CardDescription>
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
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="collected" fill="var(--color-collected)" radius={4} isAnimationActive={false} />
          <Bar dataKey="outstanding" fill="var(--color-outstanding)" radius={4} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </CardContent>
  </Card>
);

const complianceConfig = {
  score: { label: 'Compliance score', color: 'var(--interactive-primary)' },
};

const compliance = [
  { month: 'Mar', score: 74 },
  { month: 'Apr', score: 79 },
  { month: 'May', score: 83 },
  { month: 'Jun', score: 81 },
  { month: 'Jul', score: 88 },
  { month: 'Aug', score: 94 },
];

export const ComplianceScoreTrend = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Compliance score</CardTitle>
      <CardDescription>
        Document posting, meeting notice and record-request timeliness, rolled to a single score
      </CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer config={complianceConfig} className="h-64 w-full">
        <LineChart data={compliance} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            domain={[60, 100]}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(value: number) => String(value)}
          />
          <Line
            dataKey="score"
            type="monotone"
            stroke="var(--color-score)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--color-score)' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </CardContent>
  </Card>
);

// Aging buckets are an ESCALATION, not four independent categories, so the
// ramp runs green -> gold -> orange -> red. The token layer ships a status
// scale but no categorical scale, which is why the two middle steps reach for
// palette ramp variables rather than a semantic status token.
const agingConfig = {
  days0to30: { label: '0-30 days', color: 'var(--status-success)' },
  days31to60: { label: '31-60 days', color: 'var(--gold-500)' },
  days61to90: { label: '61-90 days', color: 'var(--orange-600)' },
  days90plus: { label: '90+ days', color: 'var(--status-danger)' },
};

const aging = [
  { community: 'Sunset Condos', days0to30: 8412, days31to60: 5180, days61to90: 6247, days90plus: 9533 },
  { community: 'Palm Shores HOA', days0to30: 4120, days31to60: 2260, days61to90: 980, days90plus: 3410 },
  { community: 'Sunset Ridge Apts', days0to30: 6740, days31to60: 3915, days61to90: 2180, days90plus: 1120 },
];

export const DelinquencyAging = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Delinquency aging by community</CardTitle>
      <CardDescription>Outstanding balances across the portfolio, 1 September 2026</CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer config={agingConfig} className="h-64 w-full">
        <BarChart data={aging} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => '$' + Math.round(value / 1000) + 'k'}
          />
          <YAxis dataKey="community" type="category" tickLine={false} axisLine={false} width={140} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="days0to30" stackId="a" fill="var(--color-days0to30)" isAnimationActive={false} />
          <Bar dataKey="days31to60" stackId="a" fill="var(--color-days31to60)" isAnimationActive={false} />
          <Bar dataKey="days61to90" stackId="a" fill="var(--color-days61to90)" isAnimationActive={false} />
          <Bar dataKey="days90plus" stackId="a" fill="var(--color-days90plus)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </CardContent>
  </Card>
);
