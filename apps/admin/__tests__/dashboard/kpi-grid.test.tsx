// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));
import { KpiGrid } from '@/components/dashboard/KpiGrid';
import { platformDashboardTestUtils } from '@/lib/server/dashboard';

const stats = {
  overview: { communities: 46, demos: 7, members: 3912, documents: 900 },
  billing: platformDashboardTestUtils.buildBillingSummary([{ subscription_status: 'active' }, { subscription_status: 'past_due' }]),
  compliance: { averageScore: 84, atRiskCount: 5, totalTracked: 41, distribution: { top: 14, high: 12, mid: 10, low: 5 } },
  lifecycle: { activeFreeAccess: 0, pendingDeletions: 2 },
  deltas: { communities30d: 3, members30d: 8 },
};
const series = { mrr: [{ month: '2026-09', value: 18640 }], pastDue: [], communities: [], members: [] };
const signals = { counts: { inbox: 7, tickets: 0, health: 4, onboarding: 0, billing: 1, leads: 0, deletion: 2 }, items: [], critical: null, generatedAt: 'x', failed: [] };

describe('KpiGrid', () => {
  it('renders eight cards and opens the detail dialog with a CTA', () => {
    render(<KpiGrid stats={stats as any} series={series} signals={signals} />);
    expect(screen.getAllByRole('button')).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: /open threads/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('7');
    expect(screen.getByRole('link', { name: /open inbox/i }).getAttribute('href')).toBe('/inbox');
  });
  it('shows no delta where there is no history', () => {
    render(<KpiGrid stats={stats as any} series={series} signals={signals} />);
    expect(screen.getByRole('button', { name: /avg\. compliance/i }).textContent).not.toMatch(/vs\./);
  });

  it('renders the true latest MRR, not the zero current-month chart bucket', () => {
    // Reproduces the exact defect: from UTC midnight on the 1st until the
    // daily cron writes a new snapshot, `series.mrr`'s current-month bucket
    // is a real `0` (no rows yet), while `series.latestMrr` carries the
    // actual latest snapshot value. The MRR card must read the latter.
    const seriesWithOpenCurrentMonth = {
      mrr: [
        { month: '2026-08', value: 18640 },
        { month: '2026-09', value: 0 }, // no snapshot yet this month
      ],
      pastDue: [],
      communities: [],
      members: [],
      latestMrr: 18640,
      latestMrrDeltaPct: 1.5,
    };
    render(<KpiGrid stats={stats as any} series={seriesWithOpenCurrentMonth} signals={signals} />);
    const mrrCard = screen.getByRole('button', { name: 'MRR' });
    expect(mrrCard.textContent).toContain('$18,640');
    expect(mrrCard.textContent).not.toContain('$0');
  });

  it('captions each delta with the period its own number measures', () => {
    const seriesWithDeltas = {
      mrr: [
        { month: '2026-08', value: 18000 },
        { month: '2026-09', value: 18640 },
      ],
      pastDue: [
        { month: '2026-08', value: 4 },
        { month: '2026-09', value: 2 },
      ],
      communities: [],
      members: [],
      latestMrr: 18640,
      latestMrrDeltaPct: 5.9, // day-over-day, off the latest daily snapshot
    };
    render(<KpiGrid stats={stats as any} series={seriesWithDeltas} signals={signals} />);

    // MRR's delta is day-over-day — never "vs last 30 days" or "vs last month".
    const mrrCard = screen.getByRole('button', { name: 'MRR' });
    expect(mrrCard.textContent).toContain('vs yesterday');
    expect(mrrCard.textContent).not.toContain('vs last 30 days');
    expect(mrrCard.textContent).not.toContain('vs last month');

    // Past due's delta is month-over-month (bucket-to-bucket) — never "vs last 30 days".
    const pastDueCard = screen.getByRole('button', { name: 'Past due' });
    expect(pastDueCard.textContent).toContain('vs last month');
    expect(pastDueCard.textContent).not.toContain('vs last 30 days');

    // Communities/Members are true 30-day deltas.
    const communitiesCard = screen.getByRole('button', { name: 'Communities' });
    expect(communitiesCard.textContent).toContain('vs last 30 days');

    // The detail dialog must agree with the compact card for the same metric.
    fireEvent.click(mrrCard);
    expect(screen.getByRole('dialog').textContent).toContain('vs yesterday');
  });
});
