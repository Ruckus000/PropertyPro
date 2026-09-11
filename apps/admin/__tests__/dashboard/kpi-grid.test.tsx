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

    // This fixture's Past due is a -50% delta (4 -> 2, an improvement,
    // since a falling past-due count is good). It must render GREEN
    // (success), never red (danger) — this is the assertion the caption-only
    // version of this test was missing.
    expect(pastDueCard.innerHTML).toContain('text-status-success');
    expect(pastDueCard.innerHTML).not.toContain('text-status-danger');
  });

  it('renders a revenue DROP as red/down, never hardcoded green growth — and the dialog agrees', () => {
    // The exact reported defect: MRR down 8% day-over-day must show a red
    // down arrow on the compact card, matching the red the detail dialog
    // already computed from `delta < 0`. Before the fix, `trend` was
    // hardcoded 'up' on every card, so this rendered a green up arrow —
    // stating the opposite of what happened to revenue.
    const seriesWithMrrDrop = {
      mrr: [
        { month: '2026-08', value: 20000 },
        { month: '2026-09', value: 18400 },
      ],
      pastDue: [],
      communities: [],
      members: [],
      latestMrr: 18400,
      latestMrrDeltaPct: -8,
    };
    render(<KpiGrid stats={stats as any} series={seriesWithMrrDrop} signals={signals} />);

    const mrrCard = screen.getByRole('button', { name: 'MRR' });
    expect(mrrCard.textContent).toContain('8%');
    expect(mrrCard.innerHTML).toContain('text-status-danger');
    expect(mrrCard.innerHTML).not.toContain('text-status-success');

    fireEvent.click(mrrCard);
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('-8%');
    expect(dialog.innerHTML).toContain('text-status-danger');
    expect(dialog.innerHTML).not.toContain('text-status-success');
  });

  it('colours a rising MRR green/up, matching the dialog', () => {
    const seriesWithMrrGrowth = {
      mrr: [
        { month: '2026-08', value: 18000 },
        { month: '2026-09', value: 19620 },
      ],
      pastDue: [],
      communities: [],
      members: [],
      latestMrr: 19620,
      latestMrrDeltaPct: 9,
    };
    render(<KpiGrid stats={stats as any} series={seriesWithMrrGrowth} signals={signals} />);

    const mrrCard = screen.getByRole('button', { name: 'MRR' });
    expect(mrrCard.innerHTML).toContain('text-status-success');
    expect(mrrCard.innerHTML).not.toContain('text-status-danger');

    fireEvent.click(mrrCard);
    const dialog = screen.getByRole('dialog');
    expect(dialog.innerHTML).toContain('text-status-success');
    expect(dialog.innerHTML).not.toContain('text-status-danger');
  });

  it('colours a falling Past due green (invertTrend: down is good) on both the card and its dialog', () => {
    const seriesWithPastDueDrop = {
      mrr: [],
      pastDue: [
        { month: '2026-08', value: 4 },
        { month: '2026-09', value: 2 },
      ],
      communities: [],
      members: [],
    };
    render(<KpiGrid stats={stats as any} series={seriesWithPastDueDrop} signals={signals} />);

    const pastDueCard = screen.getByRole('button', { name: 'Past due' });
    expect(pastDueCard.textContent).toContain('50%');
    expect(pastDueCard.innerHTML).toContain('text-status-success');
    expect(pastDueCard.innerHTML).not.toContain('text-status-danger');

    fireEvent.click(pastDueCard);
    const dialog = screen.getByRole('dialog');
    expect(dialog.innerHTML).toContain('text-status-success');
    expect(dialog.innerHTML).not.toContain('text-status-danger');
  });

  it('colours a rising Past due red (invertTrend: up is bad) on both the card and its dialog', () => {
    const seriesWithPastDueRise = {
      mrr: [],
      pastDue: [
        { month: '2026-08', value: 2 },
        { month: '2026-09', value: 4 },
      ],
      communities: [],
      members: [],
    };
    render(<KpiGrid stats={stats as any} series={seriesWithPastDueRise} signals={signals} />);

    const pastDueCard = screen.getByRole('button', { name: 'Past due' });
    expect(pastDueCard.innerHTML).toContain('text-status-danger');
    expect(pastDueCard.innerHTML).not.toContain('text-status-success');

    fireEvent.click(pastDueCard);
    const dialog = screen.getByRole('dialog');
    expect(dialog.innerHTML).toContain('text-status-danger');
    expect(dialog.innerHTML).not.toContain('text-status-success');
  });

  it('computes the Past due delta from the true latest snapshot, not the zero current-month bucket', () => {
    // Same defect shape `latestMrr` fixed for MRR: from UTC midnight on the
    // 1st, the current month's `pastDue` bucket is a real 0 until the daily
    // cron writes today's snapshot. Comparing against that phantom 0 would
    // show a spurious ~100% swing even though the real count hasn't moved.
    const seriesWithOpenCurrentMonth = {
      mrr: [],
      pastDue: [
        { month: '2026-08', value: 4 },
        { month: '2026-09', value: 0 }, // no snapshot yet this month
      ],
      communities: [],
      members: [],
      latestPastDue: 4, // the real current count — unchanged from last month
    };
    render(<KpiGrid stats={stats as any} series={seriesWithOpenCurrentMonth} signals={signals} />);

    const pastDueCard = screen.getByRole('button', { name: 'Past due' });
    expect(pastDueCard.textContent).toContain('0%');
    expect(pastDueCard.textContent).not.toContain('100%');
  });
});
