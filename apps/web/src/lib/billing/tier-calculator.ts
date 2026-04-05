export type VolumeTier = 'none' | 'tier_10' | 'tier_15' | 'tier_20';

export function determineTier(activeCommunityCount: number): VolumeTier {
  if (activeCommunityCount >= 11) return 'tier_20';
  if (activeCommunityCount >= 6) return 'tier_15';
  if (activeCommunityCount >= 3) return 'tier_10';
  return 'none';
}

export function tierToCouponId(tier: VolumeTier): string | null {
  switch (tier) {
    case 'tier_10': return 'volume_10pct';
    case 'tier_15': return 'volume_15pct';
    case 'tier_20': return 'volume_20pct';
    case 'none': return null;
  }
}

export function tierToPercentOff(tier: VolumeTier): number {
  switch (tier) {
    case 'tier_10': return 10;
    case 'tier_15': return 15;
    case 'tier_20': return 20;
    case 'none': return 0;
  }
}
