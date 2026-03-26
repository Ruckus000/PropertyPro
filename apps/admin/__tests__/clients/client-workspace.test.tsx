import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClientWorkspace } from '@/components/clients/ClientWorkspace';

const baseCommunity = {
  id: 42,
  name: 'Sunset Condos',
  slug: 'sunset-condos',
  community_type: 'condo_718' as const,
  city: 'Miami',
  state: 'FL',
  zip_code: '33101',
  address_line1: '123 Ocean Dr',
  subscription_status: 'active',
  subscription_plan: 'starter',
  custom_domain: null,
  site_published_at: null,
  timezone: 'America/New_York',
  transparency_enabled: true,
  community_settings: {},
  created_at: '2026-03-20T00:00:00.000Z',
  memberCount: 12,
  documentCount: 34,
  complianceScore: 88,
};

describe('ClientWorkspace website status UI', () => {
  it('renders Site Live and published date for published active community', () => {
    const html = renderToStaticMarkup(
      <ClientWorkspace
        community={{
          ...baseCommunity,
          subscription_status: 'active',
          site_published_at: '2026-03-26T12:00:00.000Z',
          custom_domain: 'portal.sunsetcondo.org',
        }}
      />,
    );

    expect(html).toContain('Site Live');
    expect(html).toContain('Published Mar 26, 2026');
    expect(html).toContain('portal.sunsetcondo.org');
    expect(html).toContain('Custom domain');
  });

  it('renders Site Not Live with publish guidance when unpublished', () => {
    const html = renderToStaticMarkup(
      <ClientWorkspace
        community={{
          ...baseCommunity,
          subscription_status: 'active',
          site_published_at: null,
          custom_domain: null,
        }}
      />,
    );

    expect(html).toContain('Site Not Live');
    expect(html).toContain('Publish a public template to make the site live.');
    expect(html).toContain('sunset-condos.propertyprofl.com');
    expect(html).toContain('Default subdomain');
  });

  it('renders Site Not Live with billing guidance when billing is ineligible', () => {
    const html = renderToStaticMarkup(
      <ClientWorkspace
        community={{
          ...baseCommunity,
          subscription_status: 'past_due',
          site_published_at: '2026-03-26T12:00:00.000Z',
        }}
      />,
    );

    expect(html).toContain('Site Not Live');
    expect(html).toContain('Set billing status to Active or Trialing to make the site live.');
  });
});
