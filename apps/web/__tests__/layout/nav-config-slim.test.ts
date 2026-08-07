import { describe, expect, it } from 'vitest';
import {
  getEffectiveFeatures,
  type CommunityFeatures,
} from '@propertypro/shared';
import {
  NAV_ITEMS,
  NAV_SECTIONS,
  buildSlimNavSections,
  getVisibleItemsWithPlanGate,
  shouldUseSlimNav,
} from '../../src/components/layout/nav-config';

const CONDO_ESSENTIALS_FEATURES = getEffectiveFeatures('condo_718', 'essentials');
const CONDO_PROFESSIONAL_FEATURES = getEffectiveFeatures('condo_718', 'professional');

function visibleIds(
  role: 'property_manager' | 'resident',
  features: CommunityFeatures,
  planId: 'essentials' | 'professional',
): { defaultIds: string[]; moreIds: string[] } {
  const visible = getVisibleItemsWithPlanGate(
    NAV_ITEMS,
    role,
    features,
    'condo_718',
    planId,
  );
  const visibleById = new Map(visible.map((item) => [item.id, item] as const));
  const sections = buildSlimNavSections(visibleById, NAV_SECTIONS);
  const defaultIds = sections
    .filter((section) => section.label !== 'More')
    .flatMap((section) => section.items.map((item) => item.id));
  const moreIds =
    sections.find((section) => section.label === 'More')?.items.map((item) => item.id) ?? [];
  return { defaultIds, moreIds };
}

describe('shouldUseSlimNav', () => {
  it('enables slim nav for root_manager on essentials only', () => {
    expect(shouldUseSlimNav('root_manager', 'essentials')).toBe(true);
    expect(shouldUseSlimNav('root_manager', 'professional')).toBe(false);
    expect(shouldUseSlimNav('property_manager', 'essentials')).toBe(false);
    expect(shouldUseSlimNav(null, 'essentials')).toBe(false);
  });
});

describe('buildSlimNavSections', () => {
  it('places Essentials founding admin defaults in primary sections', () => {
    const { defaultIds } = visibleIds(
      'property_manager',
      CONDO_ESSENTIALS_FEATURES,
      'essentials',
    );

    expect(defaultIds).toEqual([
      'dashboard',
      'documents',
      'meetings',
      'announcements',
      'website',
      'compliance',
      'residents',
      'units',
    ]);
  });

  it('demotes plan-gated tools to More for Essentials', () => {
    const { moreIds } = visibleIds(
      'property_manager',
      CONDO_ESSENTIALS_FEATURES,
      'essentials',
    );

    expect(moreIds).toEqual([
      'board',
      'operations',
      // Insurance hub ships on Essentials (it's a retention feature, not an
      // upsell), so it is visible-but-demoted rather than plan-gated away.
      'insurance',
      // Reserve transparency + storm tools ship on Essentials too (enabled
      // 2026-07-20 with attorney-reviewed copy), so they are visible-but-demoted.
      'reserves',
      'storm-damage',
      'packages',
      'visitors',
      'payments',
      'violations-report',
      'contracts',
      'esign',
      'violations-inbox',
      'arc-requests',
      'audit-trail',
    ]);
  });

  it('does not activate slim nav for professional plan', () => {
    expect(shouldUseSlimNav('root_manager', 'professional')).toBe(false);
    const visible = getVisibleItemsWithPlanGate(
      NAV_ITEMS,
      'property_manager',
      CONDO_PROFESSIONAL_FEATURES,
      'condo_718',
      'professional',
    );
    expect(visible.map((item) => item.id)).toContain('operations');
  });
});

describe('getVisibleItemsWithPlanGate — lapsed communities', () => {
  // Found by live verification, not by the unit suite: the sidebar kept
  // advertising Operations/Insurance/Reserves for a lapsed community even
  // though the API refused them. The type-gate filter reads RAW type features,
  // and the plan-lock branch no-ops when planId is null — which is exactly
  // what cancellation makes it.
  // The flag is `lapsedAdmin`, already combined with the role by the caller —
  // `requireEntitledForAdminRead` gates on the ACTOR, not the surface.
  const idsFor = (lapsedAdmin: boolean) =>
    getVisibleItemsWithPlanGate(
      NAV_ITEMS,
      'property_manager',
      getEffectiveFeatures('condo_718', null),
      'condo_718',
      null, // cancellation nulls the plan
      false,
      lapsedAdmin,
    ).map((item) => item.id);

  it('hides every community surface for a lapsed admin', () => {
    // requireEntitledForAdminRead gates ~109 admin GET routes, and its only
    // permanent carve-out (REACTIVATION_CRITICAL) is notifications, onboarding,
    // fee-policy, Stripe Connect status and users/names — none of which backs a
    // nav section. So nothing here is reachable.
    const lapsed = idsFor(true);
    const notLapsed = idsFor(false);

    for (const id of ['violations-inbox', 'arc-requests', 'esign', 'payments']) {
      expect(notLapsed).toContain(id);
      expect(lapsed).not.toContain(id);
    }
  });

  it('hides documents, meetings and compliance too', () => {
    // Explicitly pinned because the opposite is intuitive and was in fact the
    // original design of this feature: statutory obligations do not pause with
    // billing. The product decision on main (#835/#837) is that they are gated
    // for ADMINS anyway — residents, who are never gated, are how an
    // association retains access to its own records.
    const lapsed = idsFor(true);
    for (const id of ['documents', 'meetings', 'compliance']) {
      expect(lapsed).not.toContain(id);
    }
  });

  it('keeps the dashboard, where the reactivate CTA lives', () => {
    expect(idsFor(true)).toEqual(['dashboard']);
  });

  it('never marks a lapsed item as merely plan-locked', () => {
    // There is no upgrade to sell — they had it and it's paused — so a "PRO"
    // pill would be the wrong affordance.
    const items = getVisibleItemsWithPlanGate(
      NAV_ITEMS,
      'property_manager',
      getEffectiveFeatures('condo_718', null),
      'condo_718',
      null,
      false,
      true,
    );
    expect(items.every((item) => !item.planLocked)).toBe(true);
  });

  it('leaves a non-lapsed community untouched', () => {
    const before = getVisibleItemsWithPlanGate(
      NAV_ITEMS, 'property_manager', CONDO_PROFESSIONAL_FEATURES, 'condo_718', 'professional', false,
    ).map((i) => i.id);
    const after = getVisibleItemsWithPlanGate(
      NAV_ITEMS, 'property_manager', CONDO_PROFESSIONAL_FEATURES, 'condo_718', 'professional', false, false,
    ).map((i) => i.id);
    expect(after).toEqual(before);
  });
});
