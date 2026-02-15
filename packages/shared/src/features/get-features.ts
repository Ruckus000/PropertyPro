/**
 * Type-safe feature flag lookup by community type.
 */

import type { CommunityType } from '../index';
import type { CommunityFeatures } from './types';
import { COMMUNITY_FEATURES } from './community-features';

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
