/**
 * Tests for the page-level plan gates.
 *
 * The behaviour under test is the NULL-PLAN rule. `plan-guard.ts` and
 * `subscription-guard.ts` both document and implement "null plan = community
 * not yet provisioned = fail open", and `getEffectiveFeatures` does the same.
 * These two gates used to disagree — a null plan produced no `planConfig`, so
 * every feature read as denied. The result was a community whose sidebar
 * advertised features, whose API would serve the writes, but whose pages
 * rendered a locked screen pointing at an upgrade CTA.
 *
 * A community lands on a null plan two ways: never provisioned, or CANCELED —
 * the Stripe cancel webhook nulls `subscriptionPlan`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';

const { requirePageCommunityMembershipMock, redirectMock } = vi.hoisted(() => ({
  requirePageCommunityMembershipMock: vi.fn(),
  redirectMock: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: requirePageCommunityMembershipMock,
}));
vi.mock('@/components/billing/locked-feature-screen', () => ({
  LockedFeatureScreen: () => null,
}));

import { FeatureGate } from '@/components/billing/feature-gate';
import { FeatureGateAnyOf } from '@/components/billing/feature-gate-any-of';

function membership(overrides: Record<string, unknown> = {}) {
  return {
    communityId: 42,
    communityName: 'Oceanview Towers',
    communityType: 'condo_718',
    role: 'root_manager',
    isUnitOwner: false,
    subscriptionPlan: null,
    isAdmin: true,
    ...overrides,
  };
}

/** The gates return either the children element or <LockedFeatureScreen />. */
function renderedChildren(result: ReactElement): boolean {
  return JSON.stringify(result).includes('CHILDREN_SENTINEL');
}

const children = <div>CHILDREN_SENTINEL</div>;

describe('FeatureGate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails OPEN on a null plan (never provisioned)', async () => {
    requirePageCommunityMembershipMock.mockResolvedValue(membership());
    const result = await FeatureGate({ feature: 'hasViolations', children });
    expect(renderedChildren(result)).toBe(true);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('fails OPEN on a null plan left behind by cancellation', async () => {
    // The cancel webhook writes subscriptionPlan = null; a churned customer
    // must not be locked out of the UI before their grace period ends.
    requirePageCommunityMembershipMock.mockResolvedValue(
      membership({ subscriptionPlan: null }),
    );
    const result = await FeatureGate({ feature: 'hasFinance', children });
    expect(renderedChildren(result)).toBe(true);
  });

  it('fails OPEN on an unrecognized plan string, matching plan-guard', async () => {
    requirePageCommunityMembershipMock.mockResolvedValue(
      membership({ subscriptionPlan: 'some_legacy_garbage' }),
    );
    const result = await FeatureGate({ feature: 'hasViolations', children });
    expect(renderedChildren(result)).toBe(true);
  });

  it('still gates a real plan that lacks the feature', async () => {
    requirePageCommunityMembershipMock.mockResolvedValue(
      membership({ subscriptionPlan: 'essentials' }),
    );
    const result = await FeatureGate({ feature: 'hasViolations', children });
    expect(renderedChildren(result)).toBe(false);
  });

  it('allows a real plan that includes the feature', async () => {
    requirePageCommunityMembershipMock.mockResolvedValue(
      membership({ subscriptionPlan: 'professional' }),
    );
    const result = await FeatureGate({ feature: 'hasViolations', children });
    expect(renderedChildren(result)).toBe(true);
  });

  it('honors community-TYPE gating, not just plan gating', async () => {
    // hasStatutoryCategories is a condo/HOA concept; an apartment on its only
    // plan must not be told to "upgrade" into a feature its type never has.
    requirePageCommunityMembershipMock.mockResolvedValue(
      membership({ communityType: 'apartment', subscriptionPlan: 'operations_plus' }),
    );
    const result = await FeatureGate({ feature: 'hasStatutoryCategories', children });
    expect(renderedChildren(result)).toBe(false);
  });

  it('redirects tenants instead of showing them the locked screen', async () => {
    requirePageCommunityMembershipMock.mockResolvedValue(
      membership({ role: 'resident', isUnitOwner: false, subscriptionPlan: 'essentials' }),
    );
    await expect(
      FeatureGate({ feature: 'hasViolations', children }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/dashboard?communityId=42');
  });
});

describe('FeatureGateAnyOf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails OPEN on a null plan', async () => {
    requirePageCommunityMembershipMock.mockResolvedValue(membership());
    const result = await FeatureGateAnyOf({
      features: ['hasViolations', 'hasARC'],
      children,
    });
    expect(renderedChildren(result)).toBe(true);
  });

  it('allows when ANY listed feature is enabled', async () => {
    requirePageCommunityMembershipMock.mockResolvedValue(
      membership({ subscriptionPlan: 'essentials' }),
    );
    const result = await FeatureGateAnyOf({
      features: ['hasViolations', 'hasMeetings'],
      children,
    });
    expect(renderedChildren(result)).toBe(true);
  });

  it('denies when NO listed feature is enabled', async () => {
    requirePageCommunityMembershipMock.mockResolvedValue(
      membership({ subscriptionPlan: 'essentials' }),
    );
    const result = await FeatureGateAnyOf({
      features: ['hasViolations', 'hasARC'],
      children,
    });
    expect(renderedChildren(result)).toBe(false);
  });
});
