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
  /** Maximum cumulative bytes a community can store in `community-site-assets`. */
  readonly siteAssetsQuotaBytes: number;
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
      hasSiteEditor: true,
      // Insurance hub ships on every condo/HOA plan including the entry tier:
      // it is a differentiation/retention feature, not an upsell lever.
      hasInsuranceHub: true,
      hasSnowbirdDigest: true,
      // Storm-damage intake ships on every plan as a differentiation/retention
      // feature (dark behind hasStormTools until the copy is attorney-approved).
      hasStormTools: true,
    },
    maxAdmins: 3,
    displayName: 'Essentials',
    monthlyPriceUsd: 199,
    siteAssetsQuotaBytes: 100 * 1024 * 1024, // 100 MB
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
      hasPackageLogging: true,
      hasVisitorLogging: true,
      hasCalendarSync: true,
      hasAccountingConnectors: true,
      // Site editor (Pro tier adds polish blocks + custom CSS)
      hasSiteEditor: true,
      hasSitePolishBlocks: true,
      hasSiteCustomCss: true,
      hasSiteCustomDomain: true,
      hasInsuranceHub: true,
      hasSnowbirdDigest: true,
      // Storm-damage intake ships on every plan as a differentiation/retention
      // feature (dark behind hasStormTools until the copy is attorney-approved).
      hasStormTools: true,
    },
    maxAdmins: Infinity,
    displayName: 'Professional',
    monthlyPriceUsd: 349,
    siteAssetsQuotaBytes: 500 * 1024 * 1024, // 500 MB
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
      // Site editor (full suite for apartment/PM tier)
      hasSiteEditor: true,
      hasSitePolishBlocks: true,
      hasSiteCustomCss: true,
      hasSiteCustomDomain: true,
      hasSitePortfolioTemplates: true,
      hasSnowbirdDigest: true,
      // Storm-damage intake ships on every plan as a differentiation/retention
      // feature (dark behind hasStormTools until the copy is attorney-approved).
      hasStormTools: true,
    },
    maxAdmins: Infinity,
    displayName: 'Operations Plus',
    monthlyPriceUsd: 499,
    siteAssetsQuotaBytes: 2 * 1024 * 1024 * 1024, // 2 GB
  },
};

/**
 * Base monthly prices (USD) keyed by plan ID.
 *
 * For UI pricing previews and volume-discount calculations.
 * These mirror the monthlyPriceUsd fields in PLAN_FEATURES — keep in sync.
 * Authoritative pricing still lives in the stripe_prices table.
 */
export const PLAN_MONTHLY_PRICES_USD = {
  essentials: 199,
  professional: 349,
  operations_plus: 499,
} as const satisfies Record<PlanId, number>;

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

/**
 * Plan tier ranking — used to gate self-service upgrades.
 *
 * Higher rank = higher tier. Plans on different community-type ladders
 * (e.g. essentials/professional vs operations_plus) are not directly
 * comparable and `comparePlanTiers` will return null.
 *
 * Apartment's operations_plus is treated as its own ladder; condo/HOA
 * use essentials → professional.
 */
const PLAN_RANK: Record<PlanId, number> = {
  essentials: 1,
  professional: 2,
  operations_plus: 1,
};

/**
 * Compare two plans by tier within the same community-type ladder.
 * Returns:
 *   - negative if `a` is lower than `b`
 *   - 0 if equal
 *   - positive if `a` is higher than `b`
 *   - null if the plans are on different ladders (no meaningful comparison)
 */
export function comparePlanTiers(a: PlanId, b: PlanId): number | null {
  const apartmentLadder: PlanId[] = ['operations_plus'];
  const condoHoaLadder: PlanId[] = ['essentials', 'professional'];

  const sameApartment = apartmentLadder.includes(a) && apartmentLadder.includes(b);
  const sameCondoHoa = condoHoaLadder.includes(a) && condoHoaLadder.includes(b);

  if (!sameApartment && !sameCondoHoa) return null;
  return PLAN_RANK[a] - PLAN_RANK[b];
}

/** True if `target` is a strict upgrade from `current` on the same ladder. */
export function isUpgrade(current: PlanId, target: PlanId): boolean {
  const cmp = comparePlanTiers(current, target);
  return cmp !== null && cmp < 0;
}
