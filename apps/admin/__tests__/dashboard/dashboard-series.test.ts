import { describe, expect, it } from 'vitest';
import { bucketByMonth, cumulativeByMonth } from '@/lib/server/dashboard-series';

const now = new Date('2026-09-08T12:00:00Z');
describe('dashboard series', () => {
  it('bucketByMonth keeps the last value per month and fills 12 months', () => {
    const pts = bucketByMonth([{ at: '2026-08-01T02:00:00Z', value: 17200 }, { at: '2026-08-30T02:00:00Z', value: 17600 }, { at: '2026-09-07T02:00:00Z', value: 18640 }], 12, now);
    expect(pts).toHaveLength(12);
    expect(pts.at(-1)).toEqual({ month: '2026-09', value: 18640 });
    expect(pts.at(-2)).toEqual({ month: '2026-08', value: 17600 });
    expect(pts[0]!.month).toBe('2025-10');
    expect(pts[0]!.value).toBe(0);
  });
  it('cumulativeByMonth is a running count', () => {
    const pts = cumulativeByMonth(['2026-07-15T00:00:00Z', '2026-08-01T00:00:00Z', '2026-08-20T00:00:00Z'], 3, now);
    expect(pts.map((p) => p.value)).toEqual([1, 3, 3]);
  });
});
