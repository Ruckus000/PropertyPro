import type { ChartConfig } from '@/components/ui/chart';

// ---------------------------------------------------------------------------
// Maintenance — stacked area
// ---------------------------------------------------------------------------

export const maintenanceChartConfig: ChartConfig = {
  open: {
    label: 'Open',
    color: 'hsl(0, 84%, 60%)',       // red-500
  },
  inProgress: {
    label: 'In Progress',
    color: 'hsl(38, 92%, 50%)',      // amber-500
  },
  resolved: {
    label: 'Resolved',
    color: 'hsl(142, 71%, 45%)',     // green-500
  },
};

// ---------------------------------------------------------------------------
// Compliance — grouped bar
// ---------------------------------------------------------------------------

export const complianceChartConfig: ChartConfig = {
  satisfied: {
    label: 'Satisfied',
    color: 'hsl(142, 71%, 45%)',     // green-500
  },
  overdue: {
    label: 'Overdue',
    color: 'hsl(38, 92%, 50%)',      // amber-500
  },
  missing: {
    label: 'Missing',
    color: 'hsl(0, 84%, 60%)',       // red-500
  },
};

// ---------------------------------------------------------------------------
// Occupancy — multi-series line (colors assigned dynamically)
// ---------------------------------------------------------------------------

const OCCUPANCY_COLORS = [
  'hsl(221, 83%, 53%)',  // blue-600
  'hsl(262, 83%, 58%)',  // violet-500
  'hsl(142, 71%, 45%)',  // green-500
  'hsl(38, 92%, 50%)',   // amber-500
  'hsl(0, 84%, 60%)',    // red-500
  'hsl(199, 89%, 48%)',  // sky-500
];

export function buildOccupancyChartConfig(communityNames: string[]): ChartConfig {
  const config: ChartConfig = {};
  communityNames.forEach((name, i) => {
    config[name] = {
      label: name,
      color: OCCUPANCY_COLORS[i % OCCUPANCY_COLORS.length]!,
    };
  });
  return config;
}

// ---------------------------------------------------------------------------
// Violations — horizontal bar
// ---------------------------------------------------------------------------

export const violationChartConfig: ChartConfig = {
  open: {
    label: 'Open',
    color: 'hsl(0, 84%, 60%)',       // red-500
  },
  fined: {
    label: 'Fined',
    color: 'hsl(38, 92%, 50%)',      // amber-500
  },
  resolved: {
    label: 'Resolved',
    color: 'hsl(142, 71%, 45%)',     // green-500
  },
};

// ---------------------------------------------------------------------------
// Delinquency — stacked horizontal bar (aging buckets)
// ---------------------------------------------------------------------------

export const delinquencyChartConfig: ChartConfig = {
  days0to30: {
    label: '0-30 days',
    color: 'hsl(142, 71%, 45%)',     // green-500
  },
  days31to60: {
    label: '31-60 days',
    color: 'hsl(48, 96%, 53%)',      // yellow-400
  },
  days61to90: {
    label: '61-90 days',
    color: 'hsl(25, 95%, 53%)',      // orange-500
  },
  days90plus: {
    label: '90+ days',
    color: 'hsl(0, 84%, 60%)',       // red-500
  },
};
