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
          },
          lifecycle: {
            activeFreeAccess: 2,
            pendingDeletions: 4,
          },
        },
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

    expect(platformDashboardTestUtils.buildComplianceSummary([
      { community_id: 1, document_id: 10, is_applicable: true },
      { community_id: 1, document_id: null, is_applicable: true },
      { community_id: 2, document_id: 20, is_applicable: true },
      { community_id: 2, document_id: 21, is_applicable: true },
      { community_id: 3, document_id: null, is_applicable: false },
    ])).toEqual({
      averageScore: 75,
      atRiskCount: 1,
      totalTracked: 2,
    });
  });
});
