import { describe, expect, it } from 'vitest';
import type { PlanId } from '../../src/plans/types';
import { PLAN_IDS, PLANS_BY_COMMUNITY_TYPE } from '../../src/plans/types';
import type { CommunityFeatures } from '../../src/features/types';
import {
  PLAN_FEATURES,
  resolvePlanId,
  findCheapestPlanForFeature,
  findCheapestPlanEntryForFeature,
} from '../../src/features/plan-features';
import { COMMUNITY_TYPES } from '../../src/index';

/**
 * All keys on CommunityFeatures, used to verify plan feature keys are valid.
 */
const ALL_FEATURE_KEYS: readonly (keyof CommunityFeatures)[] = [
  'hasCompliance',
  'hasStatutoryCategories',
  'hasLeaseTracking',
  'hasMeetings',
  'hasPublicNoticesPage',
  'hasOwnerRole',
  'hasVoting',
  'requiresPublicWebsite',
  'hasMaintenanceRequests',
  'hasAnnouncements',
  'hasFinance',
  'hasViolations',
  'hasARC',
  'hasPolls',
  'hasCommunityBoard',
  'hasWorkOrders',
  'hasAmenities',
  'hasPackageLogging',
  'hasVisitorLogging',
  'hasCalendarSync',
  'hasAccountingConnectors',
  'hasTransparencyPage',
  'hasEsign',
  'hasEmergencyNotifications',
  'hasSiteEditor',
  'hasSitePolishBlocks',
  'hasSiteCustomCss',
  'hasSiteCustomDomain',
  'hasSitePortfolioTemplates',
  'hasInsuranceHub',
  'hasReserveTransparency',
  'hasSnowbirdDigest',
  'hasStormTools',
] as const;

describe('PLAN_FEATURES config', () => {
  it('has a valid PlanFeatureConfig entry for every PlanId', () => {
    for (const planId of PLAN_IDS) {
      expect(PLAN_FEATURES[planId]).toBeDefined();
    }
  });

  it('every feature key in each plan config is a valid CommunityFeatures key', () => {
    for (const planId of PLAN_IDS) {
      const config = PLAN_FEATURES[planId];
      for (const key of Object.keys(config.features)) {
        expect(
          ALL_FEATURE_KEYS.includes(key as keyof CommunityFeatures),
          `${planId} has unknown feature key: ${key}`,
        ).toBe(true);
      }
    }
  });

  it('displayName is set for all plans', () => {
    for (const planId of PLAN_IDS) {
      expect(PLAN_FEATURES[planId].displayName).toBeTruthy();
    }
  });

  it('monthlyPriceUsd is set for all plans', () => {
    for (const planId of PLAN_IDS) {
      expect(PLAN_FEATURES[planId].monthlyPriceUsd).toBeGreaterThan(0);
    }
  });

  it('maxAdmins is a positive number for all plans', () => {
    for (const planId of PLAN_IDS) {
      expect(PLAN_FEATURES[planId].maxAdmins).toBeGreaterThan(0);
    }
  });

  it('Professional includes all Essentials features (superset)', () => {
    const essentials = PLAN_FEATURES.essentials.features;
    const professional = PLAN_FEATURES.professional.features;

    for (const [key, value] of Object.entries(essentials)) {
      if (value) {
        expect(
          professional[key as keyof CommunityFeatures],
          `Professional should include Essentials feature: ${key}`,
        ).toBe(true);
      }
    }
  });

  it('Professional includes package and visitor logging for supported community types', () => {
    const professional = PLAN_FEATURES.professional.features;
    expect(professional.hasPackageLogging).toBe(true);
    expect(professional.hasVisitorLogging).toBe(true);
  });

  it('Operations Plus includes apartment-specific features', () => {
    const ops = PLAN_FEATURES.operations_plus.features;
    expect(ops.hasLeaseTracking).toBe(true);
    expect(ops.hasPackageLogging).toBe(true);
    expect(ops.hasVisitorLogging).toBe(true);
  });

  it('Essentials does NOT include plan-gated features', () => {
    const essentials = PLAN_FEATURES.essentials.features;
    expect(essentials.hasEsign ?? false).toBe(false);
    expect(essentials.hasViolations ?? false).toBe(false);
    expect(essentials.hasMaintenanceRequests ?? false).toBe(false);
  });
});

describe('resolvePlanId', () => {
  it('returns null for null input', () => {
    expect(resolvePlanId(null)).toBeNull();
  });

  it('returns canonical ID for essentials', () => {
    expect(resolvePlanId('essentials')).toBe('essentials');
  });

  it('returns canonical ID for professional', () => {
    expect(resolvePlanId('professional')).toBe('professional');
  });

  it('returns canonical ID for operations_plus', () => {
    expect(resolvePlanId('operations_plus')).toBe('operations_plus');
  });

  it('resolves legacy alias compliance_basic to essentials', () => {
    expect(resolvePlanId('compliance_basic')).toBe('essentials');
  });

  it('resolves legacy alias compliance_plus_mobile to essentials', () => {
    expect(resolvePlanId('compliance_plus_mobile')).toBe('essentials');
  });

  it('resolves legacy alias full_platform to professional', () => {
    expect(resolvePlanId('full_platform')).toBe('professional');
  });

  it('resolves legacy alias apartment_operations to operations_plus', () => {
    expect(resolvePlanId('apartment_operations')).toBe('operations_plus');
  });

  it('returns null for unknown plan strings', () => {
    expect(resolvePlanId('unknown_plan')).toBeNull();
  });
});

describe('findCheapestPlanForFeature — community-type awareness', () => {
  it('recommends Operations Plus, not Professional, for an apartment', () => {
    // REGRESSION: the search used to span both pricing ladders and sort by
    // price, so an apartment community was recommended Professional ($349) —
    // a condo/HOA-only plan that `isPlanAvailableForCommunityType` then
    // rejects at checkout. Selling a plan the buyer cannot buy is worse than
    // no recommendation.
    expect(findCheapestPlanEntryForFeature('hasEsign', 'apartment')?.planId).toBe(
      'operations_plus',
    );
    expect(findCheapestPlanForFeature('hasEsign', 'apartment')?.displayName).toBe(
      'Operations Plus',
    );
  });

  it('still picks the cheaper condo plan when the feature is on both tiers', () => {
    expect(findCheapestPlanEntryForFeature('hasMeetings', 'condo_718')?.planId).toBe(
      'essentials',
    );
  });

  it('picks the higher condo tier when only it has the feature', () => {
    expect(findCheapestPlanEntryForFeature('hasEsign', 'condo_718')?.planId).toBe(
      'professional',
    );
    expect(findCheapestPlanEntryForFeature('hasEsign', 'hoa_720')?.planId).toBe(
      'professional',
    );
  });

  it('returns null when no plan on that type ladder has the feature', () => {
    // Apartments have no statutory-category concept at all.
    expect(findCheapestPlanEntryForFeature('hasStatutoryCategories', 'apartment')).toBeNull();
    // Condo/HOA plans have no lease tracking.
    expect(findCheapestPlanEntryForFeature('hasLeaseTracking', 'condo_718')).toBeNull();
  });

  it('falls back to searching every plan when no community type is given', () => {
    // Preserves the pre-existing (type-blind) behaviour for callers that
    // genuinely have no community context.
    expect(findCheapestPlanEntryForFeature('hasEsign')?.planId).toBe('professional');
    expect(findCheapestPlanEntryForFeature('hasLeaseTracking')?.planId).toBe(
      'operations_plus',
    );
  });

  it('only ever recommends a plan the community type can actually buy', () => {
    for (const communityType of COMMUNITY_TYPES) {
      for (const featureKey of ALL_FEATURE_KEYS) {
        const entry = findCheapestPlanEntryForFeature(featureKey, communityType);
        if (entry) {
          expect(PLANS_BY_COMMUNITY_TYPE[communityType]).toContain(entry.planId);
        }
      }
    }
  });
});

describe('PLANS_BY_COMMUNITY_TYPE', () => {
  it('lists only canonical plan ids, in ascending price order', () => {
    for (const communityType of COMMUNITY_TYPES) {
      const planIds = PLANS_BY_COMMUNITY_TYPE[communityType];
      expect(planIds.length).toBeGreaterThan(0);
      for (const planId of planIds) {
        expect(PLAN_IDS).toContain(planId);
      }
      const prices = planIds.map((id) => PLAN_FEATURES[id].monthlyPriceUsd);
      expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    }
  });

  it('covers every plan across all ladders — no unsellable plan', () => {
    const sellable = new Set(COMMUNITY_TYPES.flatMap((t) => [...PLANS_BY_COMMUNITY_TYPE[t]]));
    expect([...sellable].sort()).toEqual([...PLAN_IDS].sort());
  });
});
