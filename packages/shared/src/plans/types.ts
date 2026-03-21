/**
 * Plan identifiers and legacy alias mapping.
 *
 * PropertyPro subscriptions use three plan tiers. Legacy plan IDs from
 * the original signup flow are mapped to their modern equivalents via
 * LEGACY_PLAN_ALIASES so that existing database records resolve correctly.
 */

/** Canonical plan identifiers (new pricing model). */
export const PLAN_IDS = ['essentials', 'professional', 'operations_plus'] as const;

/** A valid plan identifier. */
export type PlanId = (typeof PLAN_IDS)[number];

/**
 * Maps legacy plan IDs (stored in older signup records) to their
 * modern PlanId equivalents.
 */
export const LEGACY_PLAN_ALIASES: Record<string, PlanId> = {
  compliance_basic: 'essentials',
  compliance_plus_mobile: 'essentials',
  full_platform: 'professional',
  apartment_operations: 'operations_plus',
};
