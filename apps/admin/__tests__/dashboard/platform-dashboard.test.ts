// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlatformDashboard } from '@/components/dashboard/PlatformDashboard';
import { platformDashboardTestUtils } from '@/lib/server/dashboard';

describe('platform dashboard', () => {
  it('renders server-provided stats without a loading placeholder', () => {
    const html = renderToStaticMarkup(
      createElement(PlatformDashboard, {
        stats: {
          overview: {
            communities: 12,
            demos: 3,
            members: 240,
            documents: 128,
          },
          billing: {
            active: 10,
            trialing: 1,
            past_due: 1,
            canceled: 0,
            none: 0,
          },
          compliance: {
            averageScore: 88,
            atRiskCount: 1,
            totalTracked: 12,
            distribution: { top: 9, high: 2, mid: 0, low: 1 },
          },
          lifecycle: {
            activeFreeAccess: 2,
            pendingDeletions: 4,
          },
          deltas: {
            communities30d: 1,
            members30d: 6,
          },
        },
        series: {
          mrr: [{ month: '2026-09', value: 18640 }],
          pastDue: [{ month: '2026-09', value: 1 }],
          communities: [{ month: '2026-09', value: 12 }],
          members: [{ month: '2026-09', value: 240 }],
          latestMrrDeltaPct: 12.5,
        },
        signals: {
          counts: { inbox: 0, tickets: 0, health: 0, onboarding: 0, billing: 0, leads: 0, deletion: 4 },
          items: [],
          critical: null,
          generatedAt: '2026-09-08T12:00:00Z',
          failed: [],
        },
        greeting: 'Good morning',
        firstName: 'Ruckus',
        today: 'Tuesday, September 8',
      }),
    );

    expect(html).toContain('12');
    expect(html).toContain('240');
    expect(html).toContain('href="/deletion-requests"');
    expect(html).not.toContain('animate-spin');
  });

  it('summarizes billing and compliance rows consistently', () => {
    expect(platformDashboardTestUtils.buildBillingSummary([
      { subscription_status: 'active' },
      { subscription_status: 'trialing' },
      { subscription_status: 'past_due' },
      { subscription_status: null },
    ])).toEqual({
      active: 1,
      trialing: 1,
      past_due: 1,
      canceled: 0,
      none: 1,
    });

    // Per-community scores from the shared rule; community 3 has nothing
    // applicable (score null) and is not tracked, not counted as 100%.
    const scored = (score: number | null) => ({ score, pastDeadline: 0, satisfied: 0, applicable: 0 });
    expect(platformDashboardTestUtils.buildComplianceSummary(new Map([
      [1, scored(50)],
      [2, scored(100)],
      [3, scored(null)],
    ]))).toEqual({
      averageScore: 75,
      atRiskCount: 1,
      totalTracked: 2,
      distribution: { top: 1, high: 0, mid: 0, low: 1 },
    });
  });
});
