import { describe, expect, it } from 'vitest';
import type { PlanId } from '../../src/plans/types';
import { PLAN_IDS } from '../../src/plans/types';
import type { CommunityFeatures } from '../../src/features/types';
import { PLAN_FEATURES, resolvePlanId } from '../../src/features/plan-features';

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
