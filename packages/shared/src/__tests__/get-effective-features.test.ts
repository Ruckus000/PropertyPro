import { describe, expect, it } from 'vitest';
import type { CommunityFeatures } from '../../src/features/types';
import {
  COMMUNITY_FEATURES,
  COMMUNITY_FEATURE_KEYS,
} from '../../src/features/community-features';
import { getEffectiveFeatures } from '../../src/features/get-features';

/**
 * All keys on CommunityFeatures — used to verify result completeness.
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

describe('getEffectiveFeatures', () => {
  it('null planId returns raw type features (fail-open for demos)', () => {
    const result = getEffectiveFeatures('condo_718', null);
    expect(result).toBe(COMMUNITY_FEATURES['condo_718']);
  });

  it('null planId for apartment returns raw type features', () => {
    const result = getEffectiveFeatures('apartment', null);
    expect(result).toBe(COMMUNITY_FEATURES['apartment']);
  });

  describe('condo_718 + essentials', () => {
    const features = getEffectiveFeatures('condo_718', 'essentials');

    it('hasCompliance is true (type enables, plan enables)', () => {
      expect(features.hasCompliance).toBe(true);
    });

    it('hasEsign is false (type enables but plan does not)', () => {
      expect(features.hasEsign).toBe(false);
    });

    it('hasMaintenanceRequests is false (type enables but plan does not)', () => {
      expect(features.hasMaintenanceRequests).toBe(false);
    });
  });

  describe('apartment + operations_plus', () => {
    const features = getEffectiveFeatures('apartment', 'operations_plus');

    it('hasLeaseTracking is true (both enable)', () => {
      expect(features.hasLeaseTracking).toBe(true);
    });

    it('hasCompliance is false (type disables, regardless of plan)', () => {
      expect(features.hasCompliance).toBe(false);
    });

    it('hasPackageLogging is true (both enable)', () => {
      expect(features.hasPackageLogging).toBe(true);
    });

    it('hasVisitorLogging is true (both enable)', () => {
      expect(features.hasVisitorLogging).toBe(true);
    });
  });

  describe('condo_718 + professional', () => {
    const features = getEffectiveFeatures('condo_718', 'professional');

    it('all condo features that professional enables are true', () => {
      // Professional enables most features, and condo_718 enables all type features
      expect(features.hasCompliance).toBe(true);
      expect(features.hasEsign).toBe(true);
      expect(features.hasViolations).toBe(true);
      expect(features.hasARC).toBe(true);
      expect(features.hasMaintenanceRequests).toBe(true);
      expect(features.hasFinance).toBe(true);
      expect(features.hasVoting).toBe(true);
      expect(features.hasPackageLogging).toBe(true);
      expect(features.hasVisitorLogging).toBe(true);
      expect(features.hasMeetings).toBe(true);
      expect(features.hasAnnouncements).toBe(true);
    });

    it('lease tracking remains false (type disables for condos)', () => {
      expect(features.hasLeaseTracking).toBe(false);
    });
  });

  describe('hoa_720 + professional', () => {
    const features = getEffectiveFeatures('hoa_720', 'professional');

    it('package and visitor logging remain false because HOA type disables them', () => {
      expect(features.hasPackageLogging).toBe(false);
      expect(features.hasVisitorLogging).toBe(false);
    });
  });

  describe('hasSiteCustomDomain (Pro+ gating)', () => {
    it('condo_718 + professional has hasSiteCustomDomain:true', () => {
      expect(getEffectiveFeatures('condo_718', 'professional').hasSiteCustomDomain).toBe(true);
    });

    it('condo_718 + operations_plus has hasSiteCustomDomain:true', () => {
      expect(getEffectiveFeatures('condo_718', 'operations_plus').hasSiteCustomDomain).toBe(true);
    });

    it('condo_718 + essentials does NOT have hasSiteCustomDomain', () => {
      expect(getEffectiveFeatures('condo_718', 'essentials').hasSiteCustomDomain).toBe(false);
    });
  });

  it('enables hasSitePortfolioTemplates only on operations_plus', () => {
    expect(getEffectiveFeatures('condo_718', 'operations_plus').hasSitePortfolioTemplates).toBe(true);
    expect(getEffectiveFeatures('condo_718', 'professional').hasSitePortfolioTemplates).toBe(false);
    expect(getEffectiveFeatures('condo_718', 'essentials').hasSitePortfolioTemplates).toBe(false);
  });

  it('result has all 32 CommunityFeatures keys', () => {
    const features = getEffectiveFeatures('condo_718', 'essentials');
    const resultKeys = Object.keys(features).sort();
    const expectedKeys = [...ALL_FEATURE_KEYS].sort();
    expect(resultKeys).toEqual(expectedKeys);
  });

  it('all result values are boolean', () => {
    const features = getEffectiveFeatures('condo_718', 'essentials');
    for (const key of ALL_FEATURE_KEYS) {
      expect(typeof features[key]).toBe('boolean');
    }
  });

  /*
   * COMMUNITY_FEATURE_KEYS is DERIVED from COMMUNITY_FEATURES.condo_718, which
   * `satisfies Record<CommunityType, CommunityFeatures>` already makes
   * exhaustive at compile time. These two cases are the runtime backstop, and
   * they are worth having because the derivation is what runtime validators
   * (the upgrade-requests contract) trust to be complete.
   *
   * The first checks it against the hand-written list above — two independent
   * routes to the same answer, so agreement is evidence rather than tautology.
   */
  it('COMMUNITY_FEATURE_KEYS matches the independent hand-written list', () => {
    expect([...COMMUNITY_FEATURE_KEYS].sort()).toEqual([...ALL_FEATURE_KEYS].sort());
  });

  it('every community type carries the same key set, so deriving from one is safe', () => {
    // If a future refactor drops `satisfies`, one entry could diverge and the
    // derived list would silently under-report. This is what would catch it.
    const expected = [...COMMUNITY_FEATURE_KEYS].sort();
    for (const [communityType, features] of Object.entries(COMMUNITY_FEATURES)) {
      expect(Object.keys(features).sort(), `${communityType} key set`).toEqual(expected);
    }
  });
});
