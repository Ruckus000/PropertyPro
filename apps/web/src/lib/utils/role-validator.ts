/**
 * Role Validator — enforces ADR-001 community-type role constraints
 * and unit assignment policy.
 *
 * Community-type constraints:
 *   condo_718 / hoa_720: owner, tenant, board_member, board_president, cam, property_manager_admin
 *   apartment: tenant, site_manager, property_manager_admin
 *
 * Unit assignment policy:
 *   owner / tenant: unit_id REQUIRED
 *   board_member / board_president / cam / site_manager / property_manager_admin: unit_id OPTIONAL
 */
import {
  ROLE_COMMUNITY_CONSTRAINTS,
  type CommunityRole,
  type CommunityType,
} from '@propertypro/shared';

/** Roles that require a unit assignment. */
const UNIT_REQUIRED_ROLES: ReadonlySet<CommunityRole> = new Set([
  'owner',
  'tenant',
]);

export interface RoleValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Check whether a role is allowed for the given community type per ADR-001.
 */
export function isRoleAllowedForCommunityType(
  role: CommunityRole,
  communityType: CommunityType,
): boolean {
  const allowed = ROLE_COMMUNITY_CONSTRAINTS[communityType];
  return allowed.includes(role);
}

/**
 * Check whether unit_id is required for the given role per ADR-001.
 */
export function isUnitRequiredForRole(role: CommunityRole): boolean {
  return UNIT_REQUIRED_ROLES.has(role);
}

/**
 * Validate a role assignment against ADR-001 constraints.
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
