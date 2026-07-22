/**
 * Shared types for the reserve-transparency register (Wave 1 differentiation).
 *
 * Mirrors the wire shape of /api/v1/reserve-assets. The route returns rows with
 * the remaining-useful-life already computed server-side (see `withRul` in the
 * route handler) so the client never re-derives it.
 */

export type ReserveAssetCategory =
  | 'roof'
  | 'structure'
  | 'elevator'
  | 'pool'
  | 'paving'
  | 'mechanical'
  | 'exterior'
  | 'other';

export type ReserveAssetRulBand = 'healthy' | 'aware' | 'urgent' | 'past_life';

export interface ReserveAssetRecord {
  id: number;
  communityId: number;
  name: string;
  category: ReserveAssetCategory;
  yearInstalled: number;
  usefulLifeYears: number;
  replacementCostCents: number | null;
  currentReserveCents: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Computed server-side. */
  rulBand: ReserveAssetRulBand;
  /** Computed server-side. Negative once the entered useful life has elapsed. */
  yearsRemaining: number;
  /** Computed server-side: yearInstalled + usefulLifeYears. */
  endOfLifeYear: number;
}

/** Human labels for the component categories. */
export const RESERVE_ASSET_CATEGORY_LABELS: Record<ReserveAssetCategory, string> = {
  roof: 'Roof',
  structure: 'Structure',
  elevator: 'Elevator',
  pool: 'Pool',
  paving: 'Paving',
  mechanical: 'Mechanical',
  exterior: 'Exterior',
  other: 'Other',
};
