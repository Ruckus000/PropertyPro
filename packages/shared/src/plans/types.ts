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
 * The human name for each plan — the single source of the three strings.
 *
 * It lives HERE rather than being derived from `PLAN_FEATURES.displayName`
 * because the consumers are client components: `PLAN_FEATURES` is a large object
 * and importing a helper that closes over it would retain the whole thing in
 * their bundles. `plan-features.ts` reads its `displayName` fields from this
 * map, so there is exactly one place the strings exist and no way for the two to
 * drift.
 *
 * Four private copies of this map had accumulated across `apps/admin`
 * (`CommunitySettingsEditor`, `BillingActionDialog`, `BillingTab`,
 * `BillingList`), typed inconsistently, which is how a public constant starts
 * disagreeing with itself.
 */
export const PLAN_LABELS: Record<PlanId, string> = {
  essentials: 'Essentials',
  professional: 'Professional',
  operations_plus: 'Operations Plus',
};

/**
 * A plan's label, for a value that may not be a known plan id.
 *
 * Falls back to the raw string rather than to an empty cell or a thrown error:
 * a column rendering a plan nobody recognises should show what the database
 * actually holds, which is the thing an operator needs in order to fix it.
 * Legacy aliases resolve through `resolvePlanId` first.
 */
export function planLabel(raw: string | null | undefined): string {
  if (!raw) return '—';
  if ((PLAN_IDS as readonly string[]).includes(raw)) return PLAN_LABELS[raw as PlanId];
  const canonical = LEGACY_PLAN_ALIASES[raw];
  return canonical ? PLAN_LABELS[canonical] : raw;
}

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
