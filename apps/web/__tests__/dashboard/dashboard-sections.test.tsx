import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DashboardAnnouncements } from '../../src/components/dashboard/dashboard-announcements';

describe('dashboard sections', () => {
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

  });
});
