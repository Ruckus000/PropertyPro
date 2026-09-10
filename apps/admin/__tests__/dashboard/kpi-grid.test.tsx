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
});
