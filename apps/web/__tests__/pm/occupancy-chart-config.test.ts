/**
 * The occupancy chart's config keys are written verbatim into a <style> block
 * by ChartStyle (`--color-<key>: …`). A community name is user-supplied, so it
 * must never be a key: a name containing `}` or `;` would end the rule and
 * restyle the page for whoever views the report. The name lives only in the
 * config's `label`, and the chart rows are re-keyed to match, so the legend,
 * tooltip and each line's `dataKey` still find their series.
 */
import { describe, expect, it } from 'vitest';
import {
  buildOccupancyChartConfig,
  toOccupancySeriesRows,
} from '@/components/pm/reports/chart-configs';

const HOSTILE = 'Bay Club} body{display:none} x{';
const NAMES = [HOSTILE, 'Palm; Shores', 'Sunset Ridge Apartments'];

describe('occupancy chart config', () => {
  it('config keys contain no community name', () => {
    const config = buildOccupancyChartConfig(NAMES);
    const keys = Object.keys(config);

    expect(keys).toHaveLength(3);
    for (const key of keys) {
      expect(key).toMatch(/^community-\d+$/);
      for (const name of NAMES) expect(key).not.toContain(name);
    }
    // The name survives, as the label only.
    expect(Object.values(config).map((c) => c.label)).toEqual(NAMES);
  });

  it('chart rows are keyed the same way as the config', () => {
    const config = buildOccupancyChartConfig(NAMES);
    const rows = toOccupancySeriesRows(
      [{ month: '2026-10', [HOSTILE]: 91, 'Palm; Shores': 80, 'Sunset Ridge Apartments': 75 }],
      NAMES,
    );

    expect(rows).toEqual([
      { month: '2026-10', 'community-0': 91, 'community-1': 80, 'community-2': 75 },
    ]);
    for (const key of Object.keys(rows[0]!).filter((k) => k !== 'month')) {
      expect(config[key]).toBeDefined();
    }
  });
});
