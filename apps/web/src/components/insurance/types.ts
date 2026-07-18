/**
 * Shared types for the insurance hub (Wave 1).
 *
 * Mirrors the wire shape of /api/v1/wind-mitigation. The route returns rows
 * with the expiry band already computed server-side (see
 * `withExpiryStatus` in the route handler) so the client never re-derives it.
 */

export type WindMitigationFormType = 'oir_b1_1802' | 'mit_bt_ii' | 'mit_bt_iii';
export type WindMitigationFormVersion = 'pre_2026' | '2026_04';
export type WindMitigationExpiryBand = '180_days' | '90_days' | '30_days' | 'expired' | 'none';

export interface WindMitigationReportRecord {
  id: number;
  communityId: number;
  documentId: number;
  formType: WindMitigationFormType;
  formVersion: WindMitigationFormVersion;
  buildingLabel: string | null;
  /** ISO date (YYYY-MM-DD). */
  inspectedAt: string;
  /** ISO date (YYYY-MM-DD). */
  expiresAt: string;
  inspectorName: string | null;
  inspectorLicense: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Computed server-side. */
  expiryBand: WindMitigationExpiryBand;
  /** Computed server-side. Negative once expired. */
  daysUntilExpiry: number;
}

/** Human labels for the form families. Boards pick by building height. */
export const WIND_MITIGATION_FORM_LABELS: Record<WindMitigationFormType, string> = {
  oir_b1_1802: 'OIR-B1-1802 (1–3 stories)',
  mit_bt_ii: 'Citizens MIT-BT II (4+ stories)',
  mit_bt_iii: 'Citizens MIT-BT III (4+ stories)',
};

export const WIND_MITIGATION_VERSION_LABELS: Record<WindMitigationFormVersion, string> = {
  pre_2026: 'Pre-2026 form',
  '2026_04': '2026 form (effective April 1, 2026)',
};

// --- Insurance summary (spec #3) ---

export type InsurancePolicyType =
  | 'property'
  | 'wind'
  | 'flood'
  | 'liability'
  | 'umbrella'
  | 'other';
export type InsurancePolicyExpiryBand = '60_days' | '30_days' | 'expired' | 'none';

export interface InsurancePolicyRecord {
  id: number;
  communityId: number;
  policyType: InsurancePolicyType;
  carrierName: string;
  /** Present only for admin-tier readers (stripped server-side otherwise). */
  policyNumber?: string | null;
  coverageSummary: string | null;
  deductibleSummary: string | null;
  effectiveAt: string | null;
  expiresAt: string;
  agentName: string | null;
  agentEmail: string | null;
  agentPhone: string | null;
  documentId: number | null;
  createdAt: string;
  updatedAt: string;
  expiryBand: InsurancePolicyExpiryBand;
  daysUntilExpiry: number;
}

export const INSURANCE_POLICY_TYPE_LABELS: Record<InsurancePolicyType, string> = {
  property: 'Property',
  wind: 'Wind',
  flood: 'Flood',
  liability: 'Liability',
  umbrella: 'Umbrella',
  other: 'Other',
};
