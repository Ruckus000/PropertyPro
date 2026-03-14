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
  ROLE_COMMUNITY_CONSTRAINTS,
  NEW_COMMUNITY_ROLES,
  type CommunityRole,
  type CommunityType,
  type NewCommunityRole,
} from '@propertypro/shared';

/** Roles that require a unit assignment (new model). */
const UNIT_REQUIRED_ROLES_V2: ReadonlySet<NewCommunityRole> = new Set([
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
 * Accepts both old CommunityRole and new NewCommunityRole.
 */
export function isRoleAllowedForCommunityType(
  role: CommunityRole | NewCommunityRole,
  communityType: CommunityType,
): boolean {
  // New roles are allowed in all community types
  if ((NEW_COMMUNITY_ROLES as readonly string[]).includes(role)) {
    return true;
  }
  // Legacy role: check constraints
  const allowed = ROLE_COMMUNITY_CONSTRAINTS[communityType];
  return allowed.includes(role as CommunityRole);
}

/**
 * Check whether unit_id is required for the given role.
 */
export function isUnitRequiredForRole(role: CommunityRole | NewCommunityRole): boolean {
  if (UNIT_REQUIRED_ROLES_V2.has(role as NewCommunityRole)) return true;
  return UNIT_REQUIRED_ROLES.has(role as CommunityRole);
}

/**
 * Validate a role assignment against constraints.
 * Accepts both old CommunityRole and new NewCommunityRole.
 *
 * Returns { valid: true } if the assignment is valid, or
 * { valid: false, error: "..." } describing the violation.
 */
export function validateRoleAssignment(
  role: CommunityRole | NewCommunityRole,
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
