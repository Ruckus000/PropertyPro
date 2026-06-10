/**
 * v3 role-transition constants (root-manager simplification).
 * Spec: docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md
 *
 * During the bilingual window (Phase 1 → Phase 4) the user_role_v2 enum holds
 * BOTH the v2 values (manager, pm_admin) and the v3 values (property_manager,
 * root_manager). Every DB-level role predicate AND every app-layer branch on a
 * raw membership.role value must match both generations, via these constants.
 * Phase 4 cleanup shrinks them to v3-only and deletes the expander.
 * The _DB_ infix means "raw user_role_v2 enum values" — as opposed to the legacy-NAME arrays in access-policies.ts (ADMIN_ROLES etc.), which hold 7-role vocabulary strings.
 */
// resident appears in no tier array below — it is the non-admin base role, not an omission.
export const TRANSITION_ROLES = ['resident', 'manager', 'pm_admin', 'property_manager', 'root_manager'] as const;
export type TransitionRole = (typeof TRANSITION_ROLES)[number];

/** Admin-tier membership rows (manager or above), both generations. */
export const ADMIN_TIER_DB_ROLES = ['manager', 'pm_admin', 'property_manager', 'root_manager'] as const;

/** Rows granting cross-community PM-portfolio scope, both generations. */
export const PM_SCOPE_DB_ROLES = ['pm_admin', 'property_manager', 'root_manager'] as const;

/** v2 'manager' and its v3 successors (community-scoped manager generation). */
export const MANAGER_TIER_DB_ROLES = ['manager', 'property_manager', 'root_manager'] as const;

/**
 * Expand a v2 role-filter value so list filters match rows of both
 * generations. Returns [] for unknown input — callers MUST short-circuit
 * (drizzle forbids inArray(col, [])).
 * Legacy 7-role NAMES (cam, board_member, …) are not valid inputs here — those filters belong to the legacy-name path until their Phase 3 drain.
 */
export function expandTransitionRoleFilter(role: string): readonly TransitionRole[] {
  switch (role) {
    case 'manager': return MANAGER_TIER_DB_ROLES;
    case 'pm_admin': return PM_SCOPE_DB_ROLES;
    case 'resident': return ['resident'];
    case 'property_manager': return ['property_manager'];
    case 'root_manager': return ['root_manager'];
    default: return [];
  }
}
