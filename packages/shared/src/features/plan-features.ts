/**
 * Plan-level feature configuration.
 *
 * Each PlanId maps to a PlanFeatureConfig that declares which
 * CommunityFeatures the plan unlocks, plus metadata (price, admin cap).
 *
 * At runtime, plan features are intersected with community-type features
 * via getEffectiveFeatures() — both dimensions must allow a feature.
 */

import type { CommunityFeatures } from './types';
import type { PlanId } from '../plans/types';
import { PLAN_IDS, LEGACY_PLAN_ALIASES } from '../plans/types';

/** Configuration for a single subscription plan. */
export interface PlanFeatureConfig {
  readonly features: Partial<Record<keyof CommunityFeatures, boolean>>;
  readonly maxAdmins: number;
  readonly displayName: string;
  readonly monthlyPriceUsd: number;
}

/**
 * Feature matrix indexed by plan ID.
 *
 * A feature omitted from `features` defaults to `false` — plans must
 * explicitly opt-in to each capability.
 *
 * Display prices (monthlyPriceUsd) are for UI rendering only. They do NOT
 * determine what Stripe charges. Authoritative pricing lives in the
 * stripe_prices table → Stripe price objects. When updating prices: change
 * both this file AND the stripe_prices row. The /api/v1/internal/readiness
 * endpoint validates stripe_prices completeness.
 */
export const PLAN_FEATURES: Record<PlanId, PlanFeatureConfig> = {
  essentials: {
    features: {
      hasCompliance: true,
      hasStatutoryCategories: true,
      hasMeetings: true,
      hasPublicNoticesPage: true,
      hasTransparencyPage: true,
      hasOwnerRole: true,
      requiresPublicWebsite: true,
      hasAnnouncements: true,
      hasEmergencyNotifications: true,
    },
    maxAdmins: 3,
    displayName: 'Essentials',
    monthlyPriceUsd: 199,
  },

  professional: {
    features: {
      // Everything in essentials
      hasCompliance: true,
      hasStatutoryCategories: true,
      hasMeetings: true,
      hasPublicNoticesPage: true,
      hasTransparencyPage: true,
      hasOwnerRole: true,
      requiresPublicWebsite: true,
      hasAnnouncements: true,
      hasEmergencyNotifications: true,
      // Professional additions
      hasEsign: true,
      hasViolations: true,
      hasARC: true,
      hasMaintenanceRequests: true,
      hasFinance: true,
      hasVoting: true,
      hasPolls: true,
      hasCommunityBoard: true,
      hasWorkOrders: true,
      hasAmenities: true,
      hasCalendarSync: true,
      hasAccountingConnectors: true,
    },
    maxAdmins: Infinity,
    displayName: 'Professional',
    monthlyPriceUsd: 349,
  },

  operations_plus: {
    features: {
      hasMeetings: true,
      hasAnnouncements: true,
      hasEmergencyNotifications: true,
      hasEsign: true,
      hasViolations: true,
      hasARC: true,
      hasMaintenanceRequests: true,
      hasFinance: true,
      hasPolls: true,
      hasCommunityBoard: true,
      hasWorkOrders: true,
      hasAmenities: true,
      hasCalendarSync: true,
      hasAccountingConnectors: true,
      hasPackageLogging: true,
      hasVisitorLogging: true,
      hasLeaseTracking: true,
    },
    maxAdmins: Infinity,
    displayName: 'Operations Plus',
    monthlyPriceUsd: 499,
  },
};

/**
 * Finds the cheapest plan that includes a specific feature.
 * Returns null if no plan includes the feature.
 */
export function findCheapestPlanForFeature(
  featureKey: keyof CommunityFeatures,
): PlanFeatureConfig | null {
  return (Object.values(PLAN_FEATURES) as PlanFeatureConfig[])
    .filter((p) => p.features[featureKey])
    .sort((a, b) => a.monthlyPriceUsd - b.monthlyPriceUsd)[0] ?? null;
}

/**
 * Resolves a raw plan string (which may be a legacy alias) to a canonical PlanId.
 *
 * Returns `null` if the input is `null` or unrecognized.
 */
export function resolvePlanId(raw: string | null): PlanId | null {
  if (raw === null) return null;
  if (PLAN_IDS.includes(raw as PlanId)) return raw as PlanId;
  return LEGACY_PLAN_ALIASES[raw] ?? null;
}
