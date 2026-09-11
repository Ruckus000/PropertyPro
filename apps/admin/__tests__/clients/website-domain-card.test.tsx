// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WebsiteDomainCard } from '@/components/clients/WebsiteDomainCard';

const baseProps = {
  communitySlug: 'sunset-condos',
  customDomain: null as string | null,
  customDomainStatus: null as string | null,
  customDomainVerifiedAt: null as string | null,
  sitePublishedAt: '2026-03-14T00:00:00.000Z',
  subscriptionStatus: 'active',
};

describe('WebsiteDomainCard', () => {
  it('renders an honest empty state when there is no custom domain — the case for every community today', () => {
    render(<WebsiteDomainCard {...baseProps} />);

    expect(screen.getByText('No custom domain configured')).toBeTruthy();
    expect(screen.getByText('sunset-condos.getpropertypro.com')).toBeTruthy();
    expect(screen.getByText('Default subdomain')).toBeTruthy();
    // No fabricated DNS-check rows or status for a domain that doesn't exist.
    expect(screen.queryByText('Status unknown')).toBeNull();
  });

  it('shows the custom domain, its status, and verified date when one is configured', () => {
    render(
      <WebsiteDomainCard
        {...baseProps}
        customDomain="portal.sunsetcondo.org"
        customDomainStatus="active"
        customDomainVerifiedAt="2026-02-01T00:00:00.000Z"
      />,
    );

    expect(screen.getByText('portal.sunsetcondo.org')).toBeTruthy();
    expect(screen.getByText('Custom domain')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText(/Verified/)).toBeTruthy();
    expect(screen.queryByText('No custom domain configured')).toBeNull();
  });

  it('shows "Status unknown" for a custom domain with a null status, rather than fabricating one', () => {
    render(<WebsiteDomainCard {...baseProps} customDomain="portal.sunsetcondo.org" />);

    expect(screen.getByText('Status unknown')).toBeTruthy();
  });

  it('falls back to the default subdomain and warns when the saved custom domain is invalid', () => {
    render(<WebsiteDomainCard {...baseProps} customDomain="javascript:alert(1)" />);

    expect(screen.getByText('sunset-condos.getpropertypro.com')).toBeTruthy();
    expect(screen.getByText('Saved custom domain is invalid and is ignored for display.')).toBeTruthy();
  });

  it('shows "Live" when published and billing-eligible, "Not live" otherwise', () => {
    const { rerender } = render(<WebsiteDomainCard {...baseProps} />);
    expect(screen.getByText('Live')).toBeTruthy();

    rerender(<WebsiteDomainCard {...baseProps} sitePublishedAt={null} />);
    expect(screen.getByText('Not live')).toBeTruthy();
    expect(screen.getByText('Publish a public template to make the site live.')).toBeTruthy();
  });
});
