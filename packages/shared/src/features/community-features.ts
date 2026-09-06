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
    hasTransparencyPage: true,
    hasOwnerRole: true,
    hasVoting: true,
    requiresPublicWebsite: true,
    hasMaintenanceRequests: true,
    hasAnnouncements: true,
    hasFinance: true,
    hasViolations: true,
    hasARC: true,
    hasPolls: true,
    hasCommunityBoard: true,
    hasWorkOrders: true,
    hasAmenities: true,
    hasPackageLogging: true,
    hasVisitorLogging: true,
    hasCalendarSync: true,
    hasAccountingConnectors: true,
    hasEsign: true,
    hasEmergencyNotifications: true,
    hasSiteEditor: true,
    hasSitePolishBlocks: true,
    hasSiteCustomCss: true,
    hasSiteCustomDomain: true,
    hasSitePortfolioTemplates: true,
    hasInsuranceHub: true,
    hasReserveTransparency: true,
    hasSnowbirdDigest: true,
    // Storms hit every Florida community type — condos, HOAs, and apartment
    // buildings alike — so storm-damage intake is available everywhere. It
    // ENABLED 2026-07-20 (attorney-reviewed copy applied). Type/plan-derived flag,
    // NOT a per-community toggle — set in community-features + plan-features.
    hasStormTools: true,
  },
  hoa_720: {
    hasCompliance: true,
    hasStatutoryCategories: true,
    hasLeaseTracking: false,
    hasMeetings: true,
    hasPublicNoticesPage: true,
    hasTransparencyPage: true,
    hasOwnerRole: true,
    hasVoting: true,
    requiresPublicWebsite: true,
    hasMaintenanceRequests: true,
    hasAnnouncements: true,
    hasFinance: true,
    hasViolations: true,
    hasARC: true,
    hasPolls: true,
    hasCommunityBoard: true,
    hasWorkOrders: true,
    hasAmenities: true,
    hasPackageLogging: false,
    hasVisitorLogging: false,
    hasCalendarSync: true,
    hasAccountingConnectors: true,
    hasEsign: true,
    hasEmergencyNotifications: true,
    hasSiteEditor: true,
    hasSitePolishBlocks: true,
    hasSiteCustomCss: true,
    hasSiteCustomDomain: true,
    hasSitePortfolioTemplates: true,
    hasInsuranceHub: true,
    hasReserveTransparency: true,
    hasSnowbirdDigest: true,
    // Storms hit every Florida community type — condos, HOAs, and apartment
    // buildings alike — so storm-damage intake is available everywhere. It
    // ENABLED 2026-07-20 (attorney-reviewed copy applied). Type/plan-derived flag,
    // NOT a per-community toggle — set in community-features + plan-features.
    hasStormTools: true,
  },
  apartment: {
    hasCompliance: false,
    hasStatutoryCategories: false,
    hasLeaseTracking: true,
    hasMeetings: true,
    hasPublicNoticesPage: false,
    hasTransparencyPage: false,
    hasOwnerRole: false,
    hasVoting: false,
    requiresPublicWebsite: false,
    hasMaintenanceRequests: true,
    hasAnnouncements: true,
    hasFinance: true,
    hasViolations: false,
    hasARC: false,
    hasPolls: true,
    hasCommunityBoard: true,
    hasWorkOrders: true,
    hasAmenities: true,
    hasPackageLogging: true,
    hasVisitorLogging: true,
    hasCalendarSync: true,
    hasAccountingConnectors: true,
    hasEsign: true,
    hasEmergencyNotifications: true,
    hasSiteEditor: true,
    hasSitePolishBlocks: true,
    hasSiteCustomCss: true,
    hasSiteCustomDomain: true,
    hasSitePortfolioTemplates: true,
    // Apartments have no owner-occupied units and no association master
    // policy to share — the insurance hub is condo/HOA only.
    hasInsuranceHub: false,
    // Reserve transparency is an owner-reserve disclosure concept for
    // condos (Ch. 718) and HOAs (Ch. 720); apartments have no owner reserves
    // to disclose. Note: the structural integrity reserve study (SIRS) /
    // milestone-inspection regime is condo/cooperative-only (Ch. 718/719 +
    // §553.899) and does NOT apply to Ch. 720 HOAs — this register is neither.
    hasReserveTransparency: false,
    // Seasonal/absentee residents exist in every community type, so the digest
    // is available everywhere (the board still enables it per community).
    hasSnowbirdDigest: true,
    // Storms hit every Florida community type — condos, HOAs, and apartment
    // buildings alike — so storm-damage intake is available everywhere. It
    // ENABLED 2026-07-20 (attorney-reviewed copy applied). Type/plan-derived flag,
    // NOT a per-community toggle — set in community-features + plan-features.
    hasStormTools: true,
  },
} satisfies Record<CommunityType, CommunityFeatures>;

/**
 * Every `CommunityFeatures` key, available at RUNTIME.
 *
 * DERIVED from `COMMUNITY_FEATURES` rather than hand-written, so it cannot
 * drift. The `satisfies` above makes every entry exhaustive at compile time,
 * so any one entry's keys ARE the full set — adding a flag to the interface
 * forces it into every entry, which carries it into this list for free.
 *
 * Same derivation `PLAN_ID_VALUES = Object.keys(PLAN_FEATURES)` already uses
 * for plan ids in the upgrade-requests contract.
 *
 * Exists because the interface is a TYPE and therefore unavailable to runtime
 * validators. Before this, the only runtime copy was a hand-maintained list in
 * `apps/web/src/lib/help/frontmatter-schema.ts`, kept honest by a CI guard —
 * a list that can drift and a guard to catch it, where a derivation cannot
 * drift at all.
 */
export const COMMUNITY_FEATURE_KEYS = Object.keys(
  COMMUNITY_FEATURES.condo_718,
) as readonly (keyof CommunityFeatures)[];
