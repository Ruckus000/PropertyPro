/**
 * Role Validator — v3 role-assignment policy (ADR-006).
 *
 * Role model (community-scoped, from `user_roles`):
 *   resident (owner/tenant via is_unit_owner): unit_id REQUIRED
 *   property_manager / root_manager: unit_id OPTIONAL
 *
 * All three v3 roles are valid in every community type — the owner/tenant
 * distinction is the isUnitOwner flag, and the management tiers are
 * community-agnostic.
 */
import {
  ADMIN_TIER_DB_ROLES,
  COMMUNITY_ROLES,
  type CommunityType,
  type CommunityRole,
} from '@propertypro/shared';

/**
 * Manager-tier roles — assignable ONLY via the root-only Roles & Access
 * endpoints, never the residents path. Reuses the canonical
 * `ADMIN_TIER_DB_ROLES` set so this list never drifts from the rest of the
 * role-v3 vocabulary.
 */
const MANAGER_TIER_ROLES: ReadonlySet<string> = new Set(ADMIN_TIER_DB_ROLES);

/** True if the role is resident-tier (the only tier the residents create/update path may set). */
export function isResidentTierRole(role: string): boolean {
  return !MANAGER_TIER_ROLES.has(role);
}

/** Roles that require a unit assignment. */
const UNIT_REQUIRED_ROLES: ReadonlySet<CommunityRole> = new Set([
  'resident',
]);

export interface RoleValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Check whether a role is allowed for the given community type. All v3 roles are
 * allowed in every community type; `communityType` is retained for API stability
 * and any future per-type constraint.
 */
export function isRoleAllowedForCommunityType(
  role: CommunityRole,
  _communityType: CommunityType,
): boolean {
  return (COMMUNITY_ROLES as readonly string[]).includes(role);
}

/**
 * Check whether unit_id is required for the given role.
 */
export function isUnitRequiredForRole(role: CommunityRole): boolean {
  return UNIT_REQUIRED_ROLES.has(role);
}

/**
 * Validate a v3 role assignment against unit-assignment policy.
 *
 * Returns { valid: true } if the assignment is valid, or
 * { valid: false, error: "..." } describing the violation.
 */
export function validateRoleAssignment(
  role: CommunityRole,
  communityType: CommunityType,
  unitId: number | null | undefined,
): RoleValidationResult {
  if (!isRoleAllowedForCommunityType(role, communityType)) {
    return {
      valid: false,
      error: `Role "${role}" is not allowed for community type "${communityType}"`,
    };
  }

  if (isUnitRequiredForRole(role) && unitId == null) {
    return {
      valid: false,
      error: `Role "${role}" requires a unit assignment`,
    };
  }

  return { valid: true };
}
