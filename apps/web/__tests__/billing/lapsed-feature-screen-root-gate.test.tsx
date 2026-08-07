import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { LapsedFeatureScreen } from '@/components/billing/lapsed-feature-screen';

/**
 * R3-03 × the lapsed-community screen.
 *
 * This screen is only reachable by ADMINS (`requireEntitledForAdminRead`
 * short-circuits on `!membership.isAdmin`), and it branches on
 * `canManageBilling`. Before R3-03 that predicate was true for the whole
 * management tier, so the non-admin arm was effectively dead code here.
 *
 * Narrowing billing to the root manager made that arm LIVE for property
 * managers — which is how it came to tell an admin to "contact your community
 * administrator". These tests pin the split so the dead-end cannot come back.
 */
describe('LapsedFeatureScreen — R3-03 role split', () => {
  const baseProps = { featureKey: 'violations' as const, communityId: 42 };

  it('offers the root manager the reactivate action', () => {
    render(<LapsedFeatureScreen {...baseProps} role="root_manager" />);

    const cta = screen.getByRole('link', { name: /reactivate subscription/i });
    expect(cta).toHaveAttribute('href', '/settings/billing?communityId=42');
  });

  it('withholds the reactivate action from a property manager', () => {
    render(<LapsedFeatureScreen {...baseProps} role="property_manager" />);

    expect(
      screen.queryByRole('link', { name: /reactivate subscription/i }),
    ).not.toBeInTheDocument();
  });

  it('names the root manager rather than telling an admin to contact an admin', () => {
    // The regression: a property manager IS the community administrator, so
    // "contact your community administrator" is a dead end for them.
    render(<LapsedFeatureScreen {...baseProps} role="property_manager" />);

    expect(screen.getByText(/only the root manager can reactivate/i)).toBeInTheDocument();
    expect(screen.queryByText(/contact your community administrator/i)).not.toBeInTheDocument();
  });

  it('still gives a property manager a way forward', () => {
    // The billing page is where recovery lives — it carries the claim-root CTA
    // when the community's root seat is vacant.
    render(<LapsedFeatureScreen {...baseProps} role="property_manager" />);

    expect(screen.getByRole('link', { name: /view billing/i })).toHaveAttribute(
      'href',
      '/settings/billing?communityId=42',
    );
  });
});
