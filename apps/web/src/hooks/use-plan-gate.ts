import { useMemo } from 'react';
import { PLAN_FEATURES, findCheapestPlanForFeature, type PlanId } from '@propertypro/shared';
import type { CommunityFeatures } from '@propertypro/shared';

export interface PlanGateResult {
  allowed: boolean;
  upgradePlan: { displayName: string; monthlyPriceUsd: number } | null;
}

export function usePlanGate(
  planId: PlanId | null,
  featureKey: keyof CommunityFeatures,
): PlanGateResult {
  return useMemo(() => {
    // Null plan = fail-open
    if (planId === null) return { allowed: true, upgradePlan: null };

    const config = PLAN_FEATURES[planId];
    if (!config) return { allowed: true, upgradePlan: null };

    if (config.features[featureKey]) {
      return { allowed: true, upgradePlan: null };
    }

    // Find the cheapest plan that includes this feature
    const upgradeTo = findCheapestPlanForFeature(featureKey);

    return {
      allowed: false,
      upgradePlan: upgradeTo
        ? { displayName: upgradeTo.displayName, monthlyPriceUsd: upgradeTo.monthlyPriceUsd }
        : null,
    };
  }, [planId, featureKey]);
}
