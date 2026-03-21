import { describe, expect, it } from 'vitest';
import type { CommunityFeatures } from '../../src/features/types';
import { COMMUNITY_FEATURES } from '../../src/features/community-features';
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
      expect(features.hasMeetings).toBe(true);
      expect(features.hasAnnouncements).toBe(true);
    });

    it('lease tracking remains false (type disables for condos)', () => {
      expect(features.hasLeaseTracking).toBe(false);
    });
  });

  it('result has all 24 CommunityFeatures keys', () => {
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
});
