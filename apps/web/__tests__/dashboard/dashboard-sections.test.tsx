import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DashboardQuickLinks } from '../../src/components/dashboard/dashboard-quick-links';

describe('dashboard sections', () => {
  it('renders quick links with communityId query string', () => {
    const html = renderToStaticMarkup(<DashboardQuickLinks communityId={42} />);
    // Documents now uses canonical route /communities/[id]/documents
    expect(html).toContain('/communities/42/documents');
    expect(html).toContain('/settings?communityId=42');
    expect(html).toContain('/maintenance?communityId=42');
  });
});
