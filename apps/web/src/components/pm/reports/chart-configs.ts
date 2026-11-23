import type { ChartConfig } from '@/components/ui/chart';

// ---------------------------------------------------------------------------
// Maintenance — stacked area
// ---------------------------------------------------------------------------

export const maintenanceChartConfig: ChartConfig = {
  open: {
    label: 'Open',
    color: 'hsl(0, 84%, 60%)',       // red-500  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  },
  inProgress: {
    label: 'In Progress',
    color: 'hsl(38, 92%, 50%)',      // amber-500  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  },
  resolved: {
    label: 'Resolved',
    color: 'hsl(142, 71%, 45%)',     // green-500  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  },
};

// ---------------------------------------------------------------------------
// Compliance — grouped bar
// ---------------------------------------------------------------------------

export const complianceChartConfig: ChartConfig = {
  satisfied: {
    label: 'Satisfied',
    color: 'hsl(142, 71%, 45%)',     // green-500  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  },
  overdue: {
    label: 'Overdue',
    color: 'hsl(38, 92%, 50%)',      // amber-500  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  },
  missing: {
    label: 'Missing',
    color: 'hsl(0, 84%, 60%)',       // red-500  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  },
};

// ---------------------------------------------------------------------------
// Occupancy — multi-series line (colors assigned dynamically)
// ---------------------------------------------------------------------------

const OCCUPANCY_COLORS = [
  'hsl(221, 83%, 53%)',  // blue-600  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  'hsl(262, 83%, 58%)',  // violet-500  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  'hsl(142, 71%, 45%)',  // green-500  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  'hsl(38, 92%, 50%)',   // amber-500  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  'hsl(0, 84%, 60%)',    // red-500  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  'hsl(199, 89%, 48%)',  // sky-500  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
];

/**
 * The chart key for the i-th community series. Never the community name: the
 * config's keys are written verbatim into a <style> block by ChartStyle, and a
 * name is user-supplied text. The payload names its series by name only (no
 * ids), so the key is the series' position in `communityNames`.
 */
export function occupancySeriesKey(index: number): string {
  return `community-${index}`;
}

export function buildOccupancyChartConfig(communityNames: string[]): ChartConfig {
  const config: ChartConfig = {};
  communityNames.forEach((name, i) => {
    config[occupancySeriesKey(i)] = {
      label: name,
      color: OCCUPANCY_COLORS[i % OCCUPANCY_COLORS.length]!,
    };
  });
  return config;
}

/** Re-key name-keyed chart rows by `occupancySeriesKey`, to match the config. */
export function toOccupancySeriesRows(
  chartData: ReadonlyArray<{ month: string; [communityName: string]: string | number }>,
  communityNames: string[],
): Array<Record<string, string | number>> {
  return chartData.map((row) => {
    const out: Record<string, string | number> = { month: row.month };
    communityNames.forEach((name, i) => {
      const value = row[name];
      if (value !== undefined) out[occupancySeriesKey(i)] = value;
    });
    return out;
  });
}

// ---------------------------------------------------------------------------
// Violations — horizontal bar
// ---------------------------------------------------------------------------

export const violationChartConfig: ChartConfig = {
  open: {
    label: 'Open',
    color: 'hsl(0, 84%, 60%)',       // red-500  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  },
  fined: {
    label: 'Fined',
    color: 'hsl(38, 92%, 50%)',      // amber-500  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  },
  resolved: {
    label: 'Resolved',
    color: 'hsl(142, 71%, 45%)',     // green-500  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  },
};

// ---------------------------------------------------------------------------
// Delinquency — stacked horizontal bar (aging buckets)
// ---------------------------------------------------------------------------

export const delinquencyChartConfig: ChartConfig = {
  days0to30: {
    label: '0-30 days',
    color: 'hsl(142, 71%, 45%)',     // green-500  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  },
  days31to60: {
    label: '31-60 days',
    color: 'hsl(48, 96%, 53%)',      // yellow-400  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  },
  days61to90: {
    label: '61-90 days',
    color: 'hsl(25, 95%, 53%)',      // orange-500  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  },
  days90plus: {
    label: '90+ days',
    color: 'hsl(0, 84%, 60%)',       // red-500  // design-tokens:exempt — recharts fill/stroke requires a literal color string per series; not a themeable UI surface
  },
};
