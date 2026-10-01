import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DashboardQuickLinks } from '../../src/components/dashboard/dashboard-quick-links';
import { DashboardAnnouncements } from '../../src/components/dashboard/dashboard-announcements';
import { DashboardViolations } from '../../src/components/dashboard/dashboard-violations';

describe('dashboard sections', () => {
  it('renders quick links with communityId query string', () => {
    const html = renderToStaticMarkup(<DashboardQuickLinks communityId={42} />);
    // Documents now uses canonical route /communities/[id]/documents
    expect(html).toContain('/communities/42/documents');
    expect(html).toContain('/settings?communityId=42');
    expect(html).toContain('/maintenance?communityId=42');
  });

  it('renders the dashboard announcement create entry point for admins', () => {
    const html = renderToStaticMarkup(
      <DashboardAnnouncements
        items={[]}
        communityId={42}
        canWriteAnnouncements
      />,
    );

    expect(html).toContain('/announcements/new?communityId=42');
    expect(html).toContain('Create announcement');
  });

  it('residents get resident empty states, not the manager set-up copy', () => {
    const announcements = renderToStaticMarkup(
      <DashboardAnnouncements items={[]} communityId={42} />,
    );
    expect(announcements).toContain('No announcements yet');
    expect(announcements).not.toContain('Post announcements to notify owners');

    const summary = { total: 0, byStatus: {}, recentViolations: [] };
    const resident = renderToStaticMarkup(
      <DashboardViolations summary={summary} communityId={42} canReviewViolations={false} />,
    );
    expect(resident).toContain('Nothing on your unit');
    expect(resident).not.toContain('View All');

    const board = renderToStaticMarkup(
      <DashboardViolations summary={summary} communityId={42} canReviewViolations />,
    );
    expect(board).toContain('Community is in good standing');
    expect(board).toContain('/violations?communityId=42');
  });

  it('labels a violation by its unit number, not its database id', () => {
    const summary = {
      total: 1,
      byStatus: { noticed: 1 },
      recentViolations: [
        { id: 2, unitId: 2, unitLabel: 'Unit 1B', category: 'noise', status: 'noticed' as const, severity: 'minor' as const, createdAt: '2026-10-01T00:00:00.000Z' },
      ],
    };
    const html = renderToStaticMarkup(
      <DashboardViolations summary={summary} communityId={42} canReviewViolations={false} />,
    );
    expect(html).toContain('Unit 1B');
    expect(html).not.toContain('Unit 2<');
  });
});
