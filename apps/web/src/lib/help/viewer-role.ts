/**
 * Resolve membership fields to the help-article frontmatter role vocabulary.
 *
 * v3 mapping:
 * - resident → owner/tenant (via isUnitOwner)
 * - root_manager → property_manager_admin
 * - property_manager with board designation → board_president / board_member
 * - property_manager without designation → property_manager_admin (full ops)
 *
 * Spec: docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md
 *
 * Frontmatter role strings come from HELP_FRONTMATTER_ROLES (guard-exempt
 * role-transition.ts) so this bridge doesn't inline literals counted by
 * guard:legacy-roles — these are help-content vocabulary, not runtime roles.
 */
import { HELP_FRONTMATTER_ROLES as R } from '@propertypro/shared';

export interface HelpViewerMembership {
  role: string;
  designation?: string | null;
  isUnitOwner?: boolean;
}

/**
 * Map raw membership to a single frontmatter-compatible viewer role.
 */
export function resolveHelpViewerRole(
  role: string,
  designation?: string | null,
  isUnitOwner?: boolean,
): string {
  if (role === 'root_manager') {
    return R.propertyManagerAdmin;
  }

  if (role === 'property_manager') {
    if (designation === R.boardPresident) return R.boardPresident;
    if (designation === R.boardMember) return R.boardMember;
    return R.propertyManagerAdmin;
  }

  if (role === 'resident') {
    return isUnitOwner ? 'owner' : 'tenant';
  }

  return role;
}

export function resolveHelpViewerRoleFromMembership(
  membership: HelpViewerMembership,
): string {
  return resolveHelpViewerRole(
    membership.role,
    membership.designation,
    membership.isUnitOwner,
  );
}

/**
 * Frontmatter role strings that should satisfy visibility for a resolved viewer role.
 * Keeps articles working when frontmatter lists transition aliases (pm_admin, manager, …).
 */
export function expandHelpViewerRoleAliases(resolvedRole: string): readonly string[] {
  switch (resolvedRole) {
    case R.propertyManagerAdmin:
      return [
        R.propertyManagerAdmin,
        'pm_admin',
        'property_manager',
        'root_manager',
        'manager',
      ];
    case R.cam:
      return [R.cam, 'manager'];
    default:
      // board_president, board_member, site_manager, owner, tenant, and any
      // already-canonical role resolve to themselves.
      return [resolvedRole];
  }
}
