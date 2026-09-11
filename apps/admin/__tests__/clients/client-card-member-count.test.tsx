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

describe('ClientCard community-type label', () => {
  it('labels a known type from the shared map', () => {
    const html = renderToStaticMarkup(<ClientCard client={{ ...baseClient, community_type: 'hoa_720' }} />);
    expect(html).toContain('HOA');
  });

  it('falls back to the raw value, not to "Condo §718", for a type it has no label for', () => {
    // `community_type` carries a union now, so this cast is the only way to
    // reach the fallback — which is the point: the DB can grow a fourth type
    // before this app learns its label. The old fallback was
    // `?? COMMUNITY_TYPE_LABELS.condo_718!`, which rendered such a community as
    // "Condo §718": a wrong label presented as fact.
    const unknownType = { ...baseClient, community_type: 'coop_719' } as unknown as ClientRow;
    const html = renderToStaticMarkup(<ClientCard client={unknownType} />);

    expect(html).toContain('coop_719');
    expect(html).not.toContain('Condo');
  });
});
