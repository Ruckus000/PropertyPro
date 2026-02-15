import { describe, expect, it } from 'vitest';
import type { CommunityType } from '../src';
import { COMMUNITY_TYPES } from '../src';
import type { CommunityFeatures } from '../src/features/types';
import { COMMUNITY_FEATURES } from '../src/features/community-features';
import { getFeaturesForCommunity } from '../src/features/get-features';

/**
 * All keys on CommunityFeatures, used to verify exhaustive coverage.
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
] as const;

describe('CommunityFeatures config', () => {
  describe('exhaustive coverage', () => {
    it('maps every CommunityType in COMMUNITY_TYPES', () => {
      for (const communityType of COMMUNITY_TYPES) {
        expect(COMMUNITY_FEATURES[communityType]).toBeDefined();
      }
    });

    it('includes every feature flag key for each community type', () => {
      for (const communityType of COMMUNITY_TYPES) {
        const features = COMMUNITY_FEATURES[communityType];
        for (const key of ALL_FEATURE_KEYS) {
          expect(typeof features[key]).toBe('boolean');
        }
      }
    });

    it('has no extra properties beyond CommunityFeatures keys', () => {
      for (const communityType of COMMUNITY_TYPES) {
        const featureKeys = Object.keys(COMMUNITY_FEATURES[communityType]);
        expect(featureKeys.sort()).toEqual([...ALL_FEATURE_KEYS].sort());
      }
    });
  });

  describe('condo_718 features', () => {
    const features = getFeaturesForCommunity('condo_718');

    it('has compliance features enabled', () => {
      expect(features.hasCompliance).toBe(true);
      expect(features.hasStatutoryCategories).toBe(true);
    });

    it('does not have lease tracking', () => {
      expect(features.hasLeaseTracking).toBe(false);
    });

    it('has meetings enabled', () => {
      expect(features.hasMeetings).toBe(true);
    });

    it('has public notices page', () => {
      expect(features.hasPublicNoticesPage).toBe(true);
    });

    it('has owner role', () => {
      expect(features.hasOwnerRole).toBe(true);
    });

    it('has voting', () => {
      expect(features.hasVoting).toBe(true);
    });

    it('requires public website', () => {
      expect(features.requiresPublicWebsite).toBe(true);
    });

    it('has maintenance requests', () => {
      expect(features.hasMaintenanceRequests).toBe(true);
    });

    it('has announcements', () => {
      expect(features.hasAnnouncements).toBe(true);
    });
  });

  describe('hoa_720 features', () => {
    const features = getFeaturesForCommunity('hoa_720');

    it('has compliance features enabled', () => {
      expect(features.hasCompliance).toBe(true);
      expect(features.hasStatutoryCategories).toBe(true);
    });

    it('does not have lease tracking', () => {
      expect(features.hasLeaseTracking).toBe(false);
    });

    it('has meetings enabled', () => {
      expect(features.hasMeetings).toBe(true);
    });

    it('has public notices page', () => {
      expect(features.hasPublicNoticesPage).toBe(true);
    });

    it('has owner role', () => {
      expect(features.hasOwnerRole).toBe(true);
    });

    it('has voting', () => {
      expect(features.hasVoting).toBe(true);
    });

    it('requires public website', () => {
      expect(features.requiresPublicWebsite).toBe(true);
    });

    it('has maintenance requests', () => {
      expect(features.hasMaintenanceRequests).toBe(true);
    });

    it('has announcements', () => {
      expect(features.hasAnnouncements).toBe(true);
    });
  });

  describe('apartment features', () => {
    const features = getFeaturesForCommunity('apartment');

    it('does not have compliance features', () => {
      expect(features.hasCompliance).toBe(false);
      expect(features.hasStatutoryCategories).toBe(false);
    });

    it('has lease tracking', () => {
      expect(features.hasLeaseTracking).toBe(true);
    });

    it('has meetings enabled', () => {
      expect(features.hasMeetings).toBe(true);
    });

    it('does not have public notices page', () => {
      expect(features.hasPublicNoticesPage).toBe(false);
    });

    it('does not have owner role', () => {
      expect(features.hasOwnerRole).toBe(false);
    });

    it('does not have voting', () => {
      expect(features.hasVoting).toBe(false);
    });

    it('does not require public website', () => {
      expect(features.requiresPublicWebsite).toBe(false);
    });

    it('has maintenance requests', () => {
      expect(features.hasMaintenanceRequests).toBe(true);
    });

    it('has announcements', () => {
      expect(features.hasAnnouncements).toBe(true);
    });
  });

  describe('getFeaturesForCommunity function', () => {
    it('returns the same object as COMMUNITY_FEATURES for each type', () => {
      for (const communityType of COMMUNITY_TYPES) {
        expect(getFeaturesForCommunity(communityType)).toBe(COMMUNITY_FEATURES[communityType]);
      }
    });

    it('returns readonly feature objects (all values are boolean)', () => {
      for (const communityType of COMMUNITY_TYPES) {
        const features = getFeaturesForCommunity(communityType);
        for (const key of ALL_FEATURE_KEYS) {
          expect(typeof features[key]).toBe('boolean');
        }
      }
    });
  });

  describe('feature flag consistency across community types', () => {
    it('condo_718 and hoa_720 share the same feature flags', () => {
      const condo = getFeaturesForCommunity('condo_718');
      const hoa = getFeaturesForCommunity('hoa_720');
      for (const key of ALL_FEATURE_KEYS) {
        expect(condo[key]).toBe(hoa[key]);
      }
    });

    it('apartment differs from condo/HOA on compliance-related flags', () => {
      const condo = getFeaturesForCommunity('condo_718');
      const apartment = getFeaturesForCommunity('apartment');

      // Compliance features are opposite
      expect(condo.hasCompliance).toBe(true);
      expect(apartment.hasCompliance).toBe(false);
      expect(condo.hasStatutoryCategories).toBe(true);
      expect(apartment.hasStatutoryCategories).toBe(false);

      // Lease tracking is opposite
      expect(condo.hasLeaseTracking).toBe(false);
      expect(apartment.hasLeaseTracking).toBe(true);

      // Public website requirement is opposite
      expect(condo.requiresPublicWebsite).toBe(true);
      expect(apartment.requiresPublicWebsite).toBe(false);
    });

    it('all community types share universal features', () => {
      for (const communityType of COMMUNITY_TYPES) {
        const features = getFeaturesForCommunity(communityType);
        expect(features.hasMeetings).toBe(true);
        expect(features.hasMaintenanceRequests).toBe(true);
        expect(features.hasAnnouncements).toBe(true);
      }
    });
  });

  describe('type safety', () => {
    it('COMMUNITY_FEATURES keys match COMMUNITY_TYPES exactly', () => {
      const configKeys = Object.keys(COMMUNITY_FEATURES).sort();
      const typeValues = [...COMMUNITY_TYPES].sort();
      expect(configKeys).toEqual(typeValues);
    });
  });
});
