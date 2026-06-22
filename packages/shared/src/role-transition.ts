/**
 * v3 role constants (root-manager simplification, end state).
 * Spec: docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md
 *
 * The user_role_v2 enum holds the v3 values only: resident, property_manager,
 * root_manager. Every DB-level role predicate AND every app-layer branch on a
 * raw membership.role value matches these via the constants below.
 * The _DB_ infix means "raw user_role_v2 enum values" — as opposed to the legacy-NAME arrays in access-policies.ts (ADMIN_ROLES etc.), which hold 7-role vocabulary strings.
 */
// resident appears in no tier array below — it is the non-admin base role, not an omission.
export const TRANSITION_ROLES = ['resident', 'property_manager', 'root_manager'] as const;
export type TransitionRole = (typeof TRANSITION_ROLES)[number];

/** Admin-tier membership rows (manager or above). */
export const ADMIN_TIER_DB_ROLES = ['property_manager', 'root_manager'] as const;

/** Rows granting cross-community PM-portfolio scope. */
export const PM_SCOPE_DB_ROLES = ['property_manager', 'root_manager'] as const;

/** The v3 manager-generation roles (community-scoped manager + root). */
export const MANAGER_TIER_DB_ROLES = ['property_manager', 'root_manager'] as const;

/**
 * Expand a role-filter value to the matching enum rows. Returns [] for
 * unknown input — callers MUST short-circuit (drizzle forbids inArray(col, [])).
 * Legacy 7-role NAMES (cam, board_member, …) are not valid inputs here — those filters belong to the legacy-name path.
 */
export function expandTransitionRoleFilter(role: string): readonly TransitionRole[] {
  switch (role) {
    case 'resident': return ['resident'];
    case 'property_manager': return ['property_manager'];
    case 'root_manager': return ['root_manager'];
    default: return [];
  }
}

/** Board designations (role-v3 §3.2) — statutory markers, valid on any role. */
export const BOARD_DESIGNATIONS = ['board_president', 'board_member'] as const;
export type BoardDesignation = (typeof BOARD_DESIGNATIONS)[number];

/**
 * v1 community-role strings as used in help-article frontmatter `roles:` arrays
 * and FAQ `roleVisibility` — CONTENT vocabulary, distinct from the runtime role
 * migration (the `.mdx`/FAQ rows still spell roles this way). Defined here, in
 * the guard-exempt module, so the help viewer-role bridge can reference them
 * without inlining literals that `guard:legacy-roles` would count. Same pattern
 * as BOARD_DESIGNATIONS above.
 */
export const HELP_FRONTMATTER_ROLES = {
  boardMember: 'board_member',
  boardPresident: 'board_president',
  cam: 'cam',
  siteManager: 'site_manager',
  propertyManagerAdmin: 'property_manager_admin',
} as const;

/**
 * Canonical "is a board member" predicate (role-v3 §3.2, Phase 3.2).
 * From 3.2 on, ALL board targeting (board_only audiences, the public §718
 * roster, president-notify arms) sources from `designation` via this helper —
 * never from presetKey. Lives in this guard-exempt file so consumers in
 * guard-scanned files never inline the designation literals.
 */
export function hasBoardDesignation(value: unknown): value is BoardDesignation {
  return typeof value === 'string' && (BOARD_DESIGNATIONS as readonly string[]).includes(value);
}

/**
 * President-only arms (access-request notify, billing president check).
 * Accepts `unknown` — safe to call directly on a nullable designation column.
 * Returns a plain boolean (not a type guard).
 */
export function isBoardPresident(value: unknown): boolean {
  return value === 'board_president';
}
