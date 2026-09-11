/**
 * MiniBars — a small monthly bar sparkline for a `MonthPoint[]` series.
 *
 * Deliberately not a charting-library dependency: twelve flexed divs scaled
 * to the series max, which is all a KPI-card-sized trend needs. Renders
 * nothing when every point is zero (nothing to compare bars against).
 */
import type { MonthPoint } from '@/lib/server/dashboard-series';

interface MiniBarsProps {
  data: MonthPoint[];
  height?: number;
  /**
   * What the series is a trend OVER, for the accessible name — "the last 12
   * months", "the last 24 hours".
   *
   * Added when the Health board reused this for Sentry's hourly buckets. The
   * bars are positional and the geometry is unit-agnostic, so the only thing
   * that was actually monthly was the `aria-label`, which would otherwise have
   * announced twenty-four hourly buckets as months. `MonthPoint.month` is used
   * as the React key and the hover title and is just a bucket label here.
   */
  seriesLabel?: string;
}

export function MiniBars({ data, height = 40, seriesLabel }: MiniBarsProps) {
  const max = Math.max(0, ...data.map((point) => Math.abs(point.value)));
  if (data.length === 0 || max === 0) {
    return null;
  }

  return (
    <div
      className="flex items-end gap-1"
      style={{ height }}
      role="img"
      aria-label={`Trend over ${seriesLabel ?? `the last ${data.length} months`}`}
    >
      {data.map((point) => {
        const barHeight = Math.max(2, Math.round((Math.abs(point.value) / max) * height));
        return (
          <div
            key={point.month}
            className="min-w-0 flex-1 rounded-sm bg-interactive-subtle"
            style={{ height: barHeight }}
            title={`${point.month}: ${point.value.toLocaleString()}`}
          />
        );
      })}
    </div>
  );
}
