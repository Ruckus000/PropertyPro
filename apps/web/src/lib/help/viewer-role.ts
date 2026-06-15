/**
 * Resolve membership fields to the help-article frontmatter role vocabulary.
 *
 * Call sites historically used `presetKey ?? role`, which mis-resolved:
 * - resident → should be owner/tenant (via isUnitOwner)
 * - pm_admin / root_manager → property_manager_admin
 * - property_manager without preset → property_manager_admin (full ops)
 * - manager without preset → cam (legacy default)
 *
 * Preset keys (board_president, cam, etc.) win for manager-generation rows.
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
  presetKey?: string | null;
  isUnitOwner?: boolean;
}

/**
 * Map raw membership to a single frontmatter-compatible viewer role.
 */
export function resolveHelpViewerRole(
  role: string,
  presetKey?: string | null,
  isUnitOwner?: boolean,
): string {
  if (role === 'pm_admin' || role === 'root_manager') {
    return R.propertyManagerAdmin;
  }

  if (role === 'manager' || role === 'property_manager') {
    if (presetKey === R.boardPresident) return R.boardPresident;
    if (presetKey === R.boardMember) return R.boardMember;
    if (presetKey === R.cam) return R.cam;
    if (presetKey === R.siteManager) return R.siteManager;
    if (role === 'property_manager') return R.propertyManagerAdmin;
    return R.cam;
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
    membership.presetKey,
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
