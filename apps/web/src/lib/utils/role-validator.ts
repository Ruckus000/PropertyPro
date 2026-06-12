/**
 * Role Validator — enforces community-type role constraints
 * and unit assignment policy for the hybrid 4-role model.
 *
 * New role model:
 *   resident (owner/tenant distinguished by is_unit_owner): unit_id REQUIRED
 *   manager: unit_id OPTIONAL
 *   pm_admin: unit_id OPTIONAL
 *
 * Legacy validator kept for backward compatibility during migration.
 */
import {
  ADMIN_TIER_DB_ROLES,
  ROLE_COMMUNITY_CONSTRAINTS,
  TRANSITION_ROLES,
  type CommunityRole,
  type CommunityType,
  type TransitionRole,
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

/** Roles that require a unit assignment (new model). */
const UNIT_REQUIRED_ROLES_V2: ReadonlySet<TransitionRole> = new Set([
  'resident',
]);

/** Legacy roles that require a unit assignment. */
const UNIT_REQUIRED_ROLES: ReadonlySet<CommunityRole> = new Set([
  'owner',
  'tenant',
]);

export interface RoleValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Check whether a role is allowed for the given community type.
 * Accepts both old CommunityRole and v2/v3 TransitionRole.
 */
export function isRoleAllowedForCommunityType(
  role: CommunityRole | TransitionRole,
  communityType: CommunityType,
): boolean {
  // New roles (v2 + v3 transition window) are allowed in all community types
  if ((TRANSITION_ROLES as readonly string[]).includes(role)) {
    return true;
  }
  // Legacy role: check constraints
  const allowed = ROLE_COMMUNITY_CONSTRAINTS[communityType];
  return allowed.includes(role as CommunityRole);
}

/**
 * Check whether unit_id is required for the given role.
 */
export function isUnitRequiredForRole(role: CommunityRole | TransitionRole): boolean {
  if (UNIT_REQUIRED_ROLES_V2.has(role as TransitionRole)) return true;
  return UNIT_REQUIRED_ROLES.has(role as CommunityRole);
}

/**
 * Validate a role assignment against constraints.
 * Accepts both old CommunityRole and v2/v3 TransitionRole.
 *
 * Returns { valid: true } if the assignment is valid, or
 * { valid: false, error: "..." } describing the violation.
 */
export function validateRoleAssignment(
  role: CommunityRole | TransitionRole,
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
