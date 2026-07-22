/**
 * Plan identifiers and legacy alias mapping.
 *
 * PropertyPro subscriptions use three plan tiers. Legacy plan IDs from
 * the original signup flow are mapped to their modern equivalents via
 * LEGACY_PLAN_ALIASES so that existing database records resolve correctly.
 */

import type { CommunityType } from '../index';

/** Canonical plan identifiers (new pricing model). */
export const PLAN_IDS = ['essentials', 'professional', 'operations_plus'] as const;

/** A valid plan identifier. */
export type PlanId = (typeof PLAN_IDS)[number];

/**
 * Which plans a community of each type can actually buy — the two pricing
 * ladders, in ascending tier order.
 *
 * This is the single source of truth for the type→plan relationship. Anything
 * that recommends, offers, or validates a plan must filter through it:
 * `PLAN_FEATURES` alone is type-blind, so a naive "cheapest plan with feature
 * X" search will happily recommend Professional ($349) to an apartment
 * community whose only purchasable plan is Operations Plus — a plan the
 * checkout route then rejects.
 */
export const PLANS_BY_COMMUNITY_TYPE: Record<CommunityType, readonly PlanId[]> = {
  condo_718: ['essentials', 'professional'],
  hoa_720: ['essentials', 'professional'],
  apartment: ['operations_plus'],
};

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
