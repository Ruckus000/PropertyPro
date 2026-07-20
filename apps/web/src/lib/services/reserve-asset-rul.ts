/**
 * Reserve-asset remaining-useful-life (RUL) banding.
 *
 * Pure arithmetic, no DB access: shared by the API (attaching the band to each
 * row) and the UI (badge rendering). Mirrors the pure-date-math style of
 * `wind-mitigation-expiry.ts` and reuses the SAME compliance escalation tiers
 * (calm → aware → urgent → critical) so the reserve register speaks the same
 * visual language as the rest of the platform.
 *
 * COMPLIANCE POSTURE: this is a factual countdown over the numbers the
 * association entered (install year + expected useful life). It is NOT an
 * assessment of condition, adequacy, or funding, and PropertyPro does not
 * provide engineering, financial, or legal advice. The band is a neutral
 * time-remaining bucket, never a judgment.
 */
import type { EscalationTier } from '@propertypro/ui/tokens';

/** Ordered healthiest → most-urgent. */
export type ReserveAssetRulBand = 'healthy' | 'aware' | 'urgent' | 'past_life';

export interface ReserveAssetRulStatus {
  /** Calendar year the component reaches the end of its entered useful life. */
  endOfLifeYear: number;
  /** Whole years remaining; negative once the entered useful life has elapsed. */
  yearsRemaining: number;
  band: ReserveAssetRulBand;
}

/**
 * Classify an asset's remaining useful life from its install year and expected
 * useful life, both as entered by the association.
 *
 * Bands (by whole years remaining):
 *   - `past_life`  yearsRemaining < 0   (entered useful life already elapsed)
 *   - `urgent`     0 ≤ yearsRemaining ≤ 2
 *   - `aware`      3 ≤ yearsRemaining ≤ 5
 *   - `healthy`    yearsRemaining > 5
 *
 * @param yearInstalled   Calendar year the component was installed / replaced.
 * @param usefulLifeYears Expected useful life in years (as entered).
 * @param referenceYear   Year to compute against (defaults to the current UTC year).
 */
export function classifyReserveAssetRul(
  yearInstalled: number,
  usefulLifeYears: number,
  referenceYear: number = new Date().getUTCFullYear(),
): ReserveAssetRulStatus {
  const endOfLifeYear = yearInstalled + usefulLifeYears;
  const yearsRemaining = endOfLifeYear - referenceYear;

  let band: ReserveAssetRulBand;
  if (yearsRemaining < 0) band = 'past_life';
  else if (yearsRemaining <= 2) band = 'urgent';
  else if (yearsRemaining <= 5) band = 'aware';
  else band = 'healthy';

  return { endOfLifeYear, yearsRemaining, band };
}

/**
 * Map an RUL band onto the platform's compliance escalation tiers, so the
 * reserve register's badges match the compliance dashboard's visual language.
 */
export function reserveAssetEscalationTier(band: ReserveAssetRulBand): EscalationTier {
  switch (band) {
    case 'past_life':
      return 'critical';
    case 'urgent':
      return 'urgent';
    case 'aware':
      return 'aware';
    case 'healthy':
      return 'calm';
  }
}
