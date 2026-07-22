/**
 * Community features — barrel export.
 *
 * Re-exports all feature-related types, constants, and functions.
 */

export type { CommunityFeatures } from './types';
export { COMMUNITY_FEATURES } from './community-features';
export { getFeaturesForCommunity, getEffectiveFeatures } from './get-features';
export type { PlanFeatureConfig } from './plan-features';
export {
  PLAN_FEATURES,
  PLAN_MONTHLY_PRICES_USD,
  resolvePlanId,
  findCheapestPlanForFeature,
  findCheapestPlanEntryForFeature,
  comparePlanTiers,
  isUpgrade,
} from './plan-features';
export type { PlanFeatureCopy } from './plan-feature-copy';
export { PLAN_FEATURE_COPY, DEFAULT_PLAN_FEATURE_COPY, getPlanFeatureCopy } from './plan-feature-copy';
