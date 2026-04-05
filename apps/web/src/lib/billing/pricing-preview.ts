import { determineTier, tierToPercentOff, type VolumeTier } from './tier-calculator';

export interface PricingImpactInput {
  basePricesUsd: number[];
  currentGroupSize: number;
  changeType: 'add' | 'remove';
}

export interface CommunityPriceBreakdown {
  basePriceUsd: number;
  discountedPriceUsd: number;
  discountPercent: number;
}

export interface PricingImpactResult {
  previousTier: VolumeTier;
  newTier: VolumeTier;
  perCommunityBreakdown: CommunityPriceBreakdown[];
  portfolioMonthlyDeltaUsd: number;
}

export function calculatePricingImpact(input: PricingImpactInput): PricingImpactResult {
  const newGroupSize = input.basePricesUsd.length;
  const previousTier = determineTier(input.currentGroupSize);
  const newTier = determineTier(newGroupSize);

  const prevPct = tierToPercentOff(previousTier);
  const newPct = tierToPercentOff(newTier);

  const perCommunityBreakdown: CommunityPriceBreakdown[] = input.basePricesUsd.map((base) => ({
    basePriceUsd: base,
    discountedPriceUsd: roundCents(base * (1 - newPct / 100)),
    discountPercent: newPct,
  }));

  const newTotal = input.basePricesUsd.reduce((sum, b) => sum + b * (1 - newPct / 100), 0);
  const prevTotal = input.basePricesUsd.reduce((sum, b) => sum + b * (1 - prevPct / 100), 0);
  const portfolioMonthlyDeltaUsd = roundCents(newTotal - prevTotal);

  return { previousTier, newTier, perCommunityBreakdown, portfolioMonthlyDeltaUsd };
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}
