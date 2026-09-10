import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClientCard } from '@/components/clients/ClientCard';
import type { ClientRow } from '@/lib/server/clients';

const baseClient: ClientRow = {
  id: 3,
  name: 'Marina Towers',
  slug: 'marina-towers',
  community_type: 'condo_718',
  city: 'Fort Lauderdale',
  state: 'FL',
  subscription_status: 'active',
  subscription_plan: 'professional',
  created_at: '2026-01-01T00:00:00.000Z',
  complianceScore: 82,
  memberCount: 41,
  rootless: false,
  disputeOpen: false,
};

describe('ClientCard member count', () => {
  it('renders the exact count when it is a number', () => {
    const html = renderToStaticMarkup(<ClientCard client={{ ...baseClient, memberCount: 41 }} />);
    expect(html).toContain('41 members');
  });

  it('renders an explicit unknown instead of a number when the count could not be proven exact', () => {
    const html = renderToStaticMarkup(<ClientCard client={{ ...baseClient, memberCount: null }} />);
    expect(html).toContain('Members unknown');
    expect(html).not.toMatch(/>\s*\d+\s*members?\s*</);
  });
});
