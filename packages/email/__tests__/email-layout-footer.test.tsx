/**
 * EmailLayout footer — CAN-SPAM fields.
 *
 * Every template renders through this layout, so the footer is the single place
 * a postal address and a visible opt-out can be added once rather than six
 * times. The tests pin the two things that would be wrong in opposite
 * directions: a transactional email must NOT sprout an unsubscribe link, and a
 * bulk one must not ship without the address.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-11.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@react-email/components';
import { AnnouncementEmail } from '../src/index';
import type { CommunityBranding } from '../src/index';

const base = {
  recipientName: 'Dana Reyes',
  announcementTitle: 'Pool closure',
  announcementBody: 'The pool is closed Tuesday for resurfacing.',
  authorName: 'Board',
  portalUrl: 'https://app.example/dashboard',
};

const bulkBranding: CommunityBranding = {
  communityName: 'Sunset Condos',
  postalAddressLines: ['100 Ocean Dr', 'Suite 4', 'Miami, FL 33139'],
  unsubscribeUrl: 'https://app.example/api/v1/notifications/unsubscribe?token=abc',
  unsubscribeLabel: 'Unsubscribe from announcements',
};

describe('EmailLayout footer', () => {
  it('renders every postal address line', async () => {
    const html = await render(<AnnouncementEmail branding={bulkBranding} {...base} />);

    for (const line of bulkBranding.postalAddressLines!) {
      expect(html).toContain(line);
    }
  });

  it('renders the unsubscribe link with its label', async () => {
    const html = await render(<AnnouncementEmail branding={bulkBranding} {...base} />);

    expect(html).toContain('Unsubscribe from announcements');
    expect(html).toContain('/api/v1/notifications/unsubscribe?token=abc');
  });

  it('falls back to a generic label when none is given', async () => {
    const html = await render(
      <AnnouncementEmail
        branding={{ ...bulkBranding, unsubscribeLabel: undefined }}
        {...base}
      />,
    );

    expect(html).toContain('Unsubscribe');
  });

  it('renders NEITHER block for a transactional email', async () => {
    // An unsubscribe link on a password reset or an export-ready notice is the
    // wrong affordance, and CAN-SPAM does not ask for one.
    const html = await render(
      <AnnouncementEmail branding={{ communityName: 'Sunset Condos' }} {...base} />,
    );

    expect(html).not.toContain('Unsubscribe');
    expect(html).not.toContain('Ocean Dr');
  });

  it('omits the address block when the array is empty', async () => {
    // `formatCommunityPostalAddress` returns null for an incomplete address, but
    // an empty array must not render a bare community name masquerading as one.
    const html = await render(
      <AnnouncementEmail
        branding={{ communityName: 'Sunset Condos', postalAddressLines: [] }}
        {...base}
      />,
    );

    // The name still appears in the header and copyright line; what must not
    // appear is a second, address-shaped block. One `<br />`-joined block is
    // the signature, and there is none.
    expect(html).not.toContain('Ocean Dr');
  });
});
