import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClientCard } from '@/components/clients/ClientCard';
import type { ClientRow } from '@/lib/server/clients';

/**
 * Regression coverage for Task 15 fix-1 finding #1: the replaced Rootless
 * Communities page rendered `ReassignRootControl` once per rootless
 * community (table column "Reassign root"), not just once per open dispute.
 * The clients-grid rewrite dropped the rootless-row usage, leaving every
 * rootless community WITHOUT an open dispute with no reassign entry point
 * anywhere. See the revert-check in the task-15-fix-1 report for proof this
 * test is not vacuous.
 */
const baseClient: ClientRow = {
  id: 7,
  name: 'Bayview Condos',
  slug: 'bayview-condos',
  community_type: 'condo_718',
  city: 'Miami',
  state: 'FL',
  subscription_status: 'active',
  subscription_plan: 'professional',
  created_at: '2026-01-01T00:00:00.000Z',
  complianceScore: 90,
  memberCount: 12,
  rootless: false,
  disputeOpen: false,
};

describe('ClientCard reassign-root affordance', () => {
  it('offers a reassign-root control for a rootless community with NO open dispute', () => {
    const html = renderToStaticMarkup(
      <ClientCard client={{ ...baseClient, rootless: true, disputeOpen: false }} />,
    );
    expect(html).toContain('Reassign root');
    expect(html).toContain('property_manager user id');
  });

  it('control case: a disputed (non-rootless) community still shows its dispute warning — unaffected by the rootless-card fix', () => {
    const html = renderToStaticMarkup(
      <ClientCard client={{ ...baseClient, rootless: false, disputeOpen: true }} />,
    );
    expect(html).toContain('Root claim disputed');
    // This community's own reassign entry point is DisputeBanner's, not the
    // card's — the card shouldn't duplicate it for a merely-disputed,
    // non-rootless row.
    expect(html).not.toContain('property_manager user id');
  });

  it('does not offer the control for a community that is neither rootless nor disputed', () => {
    const html = renderToStaticMarkup(
      <ClientCard client={{ ...baseClient, rootless: false, disputeOpen: false }} />,
    );
    expect(html).not.toContain('property_manager user id');
    expect(html).not.toContain('No root manager');
  });
});
