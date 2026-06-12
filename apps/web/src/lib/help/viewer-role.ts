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
 */

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
    return 'property_manager_admin';
  }

  if (role === 'manager' || role === 'property_manager') {
    if (presetKey === 'board_president') return 'board_president';
    if (presetKey === 'board_member') return 'board_member';
    if (presetKey === 'cam') return 'cam';
    if (presetKey === 'site_manager') return 'site_manager';
    if (role === 'property_manager') return 'property_manager_admin';
    return 'cam';
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
    case 'property_manager_admin':
      return [
        'property_manager_admin',
        'pm_admin',
        'property_manager',
        'root_manager',
        'manager',
      ];
    case 'cam':
      return ['cam', 'manager'];
    case 'board_president':
    case 'board_member':
    case 'site_manager':
    case 'owner':
    case 'tenant':
      return [resolvedRole];
    default:
      return [resolvedRole];
  }
}
