/**
 * Community features configuration — maps each CommunityType to its
 * enabled feature flags.
 *
 * This is the SINGLE SOURCE OF TRUTH for community-type conditional logic.
 * Components MUST use these flags (e.g., features.hasCompliance) rather
 * than checking community_type directly.
 *
 * TypeScript enforces exhaustive handling via `satisfies Record<CommunityType, CommunityFeatures>`.
 * Adding a new CommunityType without mapping it here is a compile error.
 * Adding a new flag to CommunityFeatures without setting it here is a compile error.
 */

import type { CommunityType } from '../index';
import type { CommunityFeatures } from './types';

/**
 * Feature flag matrix indexed by community type.
 *
 * Every community type MUST be explicitly listed — no defaults.
 * The `satisfies` constraint ensures compile-time exhaustiveness.
 */
export const COMMUNITY_FEATURES: Record<CommunityType, CommunityFeatures> = {
  condo_718: {
    hasCompliance: true,
    hasStatutoryCategories: true,
    hasLeaseTracking: false,
    hasMeetings: true,
    hasPublicNoticesPage: true,
    hasOwnerRole: true,
    hasVoting: true,
    requiresPublicWebsite: true,
    hasMaintenanceRequests: true,
    hasAnnouncements: true,
  },
  hoa_720: {
    hasCompliance: true,
    hasStatutoryCategories: true,
    hasLeaseTracking: false,
    hasMeetings: true,
    hasPublicNoticesPage: true,
    hasOwnerRole: true,
    hasVoting: true,
    requiresPublicWebsite: true,
    hasMaintenanceRequests: true,
    hasAnnouncements: true,
  },
  apartment: {
    hasCompliance: false,
    hasStatutoryCategories: false,
    hasLeaseTracking: true,
    hasMeetings: true,
    hasPublicNoticesPage: false,
    hasOwnerRole: false,
    hasVoting: false,
    requiresPublicWebsite: false,
    hasMaintenanceRequests: true,
    hasAnnouncements: true,
  },
} satisfies Record<CommunityType, CommunityFeatures>;
