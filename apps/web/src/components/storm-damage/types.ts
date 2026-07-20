/**
 * Shared client types for the storm-damage intake UI.
 *
 * These mirror the API row shape (packages/db storm-damage-reports schema) and
 * the contract vocabularies (apps/web/.../storm-damage/contract.ts). Keep the
 * label maps in sync with STORM_DAMAGE_CATEGORIES / _SEVERITIES / _STATUSES.
 */

export type StormDamageCategory =
  | 'roof'
  | 'water'
  | 'structural'
  | 'exterior'
  | 'common_area'
  | 'other';

export type StormDamageSeverity = 'minor' | 'moderate' | 'severe';

export type StormDamageStatus = 'submitted' | 'acknowledged' | 'closed';

export interface StormDamageReportRecord {
  id: number;
  communityId: number;
  unitId: number | null;
  reportedBy: string;
  occurredAt: string | null;
  locationLabel: string;
  category: StormDamageCategory;
  severity: StormDamageSeverity;
  description: string;
  photoDocumentIds: number[];
  status: StormDamageStatus;
  createdAt: string;
  updatedAt: string;
}

export const STORM_DAMAGE_CATEGORY_LABELS: Record<StormDamageCategory, string> = {
  roof: 'Roof',
  water: 'Water / flooding',
  structural: 'Structural',
  exterior: 'Exterior / siding',
  common_area: 'Common area',
  other: 'Other',
};

export const STORM_DAMAGE_SEVERITY_LABELS: Record<StormDamageSeverity, string> = {
  minor: 'Minor',
  moderate: 'Moderate',
  severe: 'Severe',
};

export const STORM_DAMAGE_STATUS_LABELS: Record<StormDamageStatus, string> = {
  submitted: 'Logged',
  acknowledged: 'Reviewed by management',
  closed: 'Archived',
};
