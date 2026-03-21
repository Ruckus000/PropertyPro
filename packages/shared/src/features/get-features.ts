/**
 * Type-safe feature flag lookup by community type and/or plan.
 */

import type { CommunityType } from '../index';
import type { PlanId } from '../plans/types';
import type { CommunityFeatures } from './types';
import { COMMUNITY_FEATURES } from './community-features';
import { PLAN_FEATURES } from './plan-features';

/**
 * Returns the feature flags for the given community type.
 *
 * Usage:
 * ```ts
 * const features = getFeaturesForCommunity('condo_718');
 * if (features.hasCompliance) {
 *   // render compliance checklist
 * }
 * ```
 *
 * @param communityType - One of the canonical CommunityType values
 * @returns Readonly feature flags object for the community type
 */
export function getFeaturesForCommunity(communityType: CommunityType): CommunityFeatures {
  return COMMUNITY_FEATURES[communityType];
}

/**
 * Returns the effective feature flags by intersecting community-type
 * features with plan-level features. Both dimensions must allow a
 * feature for it to be enabled.
 *
 * When `planId` is `null` (e.g. demo communities without a subscription),
 * falls back to the full community-type feature set (fail-open).
 *
 * Usage:
 * ```ts
 * const features = getEffectiveFeatures('condo_718', 'essentials');
 * if (features.hasEsign) {
 *   // only true if condo_718 AND essentials both enable hasEsign
 * }
 * ```
 */
export function getEffectiveFeatures(
  communityType: CommunityType,
  planId: PlanId | null,
): CommunityFeatures {
  const typeFeatures = COMMUNITY_FEATURES[communityType];
  if (planId === null) return typeFeatures; // fail-open for demos

  const planConfig = PLAN_FEATURES[planId];
  if (!planConfig) return typeFeatures;

  // Both type AND plan must allow
  const result = {} as Record<keyof CommunityFeatures, boolean>;
  for (const key of Object.keys(typeFeatures) as (keyof CommunityFeatures)[]) {
    result[key] = typeFeatures[key] && (planConfig.features[key] ?? false);
  }
  return result as CommunityFeatures;
}
