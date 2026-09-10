// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));
import { RevenueCard } from '@/components/dashboard/RevenueCard';
import type { DashboardSeries } from '@/lib/server/dashboard-series';

describe('RevenueCard', () => {
  it('reads MRR/ARR from the latest snapshot, not the zero current-month chart bucket', () => {
    // Same scenario as the KpiGrid regression: the bucketed `mrr` series'
    // current month is a real 0 until the daily cron runs.
    const series: DashboardSeries = {
      mrr: [
        { month: '2026-08', value: 18640 },
        { month: '2026-09', value: 0 },
      ],
      pastDue: [],
      communities: [],
      members: [],
      latestMrr: 18640,
      mrr30dAgo: 17600,
      latestMrrDeltaPct: 5.9,
    };
    render(<RevenueCard series={series} />);
    expect(screen.getByText('$18,640')).toBeTruthy();
    expect(screen.getByText('$223,680')).toBeTruthy(); // ARR = 18640 * 12
    expect(screen.queryByText('$0')).toBeNull();
  });

  it('computes Net new (30d) from the snapshot ~30 days ago, not the prior monthly bucket', () => {
    // Old behavior subtracted the last two MONTHLY buckets, so on the 1st of
    // a month this became "latest - prior month's full total" — a huge,
    // fake negative "revenue collapse". The fix compares against
    // mrr30dAgo (a real ~30-day-old daily snapshot).
    const series: DashboardSeries = {
      mrr: [
        { month: '2026-08', value: 40000 }, // a whole month's MRR
        { month: '2026-09', value: 0 }, // still-open month, no snapshot yet
      ],
      pastDue: [],
      communities: [],
      members: [],
      latestMrr: 41000,
      mrr30dAgo: 40500, // real ~30-day-old snapshot: +$500 net new
      latestMrrDeltaPct: 0.2,
    };
    render(<RevenueCard series={series} />);
    expect(screen.getByText('+$500')).toBeTruthy();
    expect(screen.queryByText(/^-\$40,000$/)).toBeNull();
  });

  it('renders "—" for Net new (30d) when there is no ~30-day-old snapshot to compare against', () => {
    const series: DashboardSeries = {
      mrr: [{ month: '2026-09', value: 5000 }],
      pastDue: [],
      communities: [],
      members: [],
      latestMrr: 5000,
      mrr30dAgo: null,
      latestMrrDeltaPct: null,
    };
    render(<RevenueCard series={series} />);
    expect(screen.getByText('—')).toBeTruthy();
  });
});
