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
      // NOTE: 'reserves' and 'storm-damage' are intentionally absent — their
      // flags (hasReserveTransparency / hasStormTools) are false until the
      // attorney-reviewed copy ships, so the type-gate filters them out
      // entirely rather than demoting them to More.
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
