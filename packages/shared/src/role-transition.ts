/**
 * v3 role tier constants (root-manager simplification, end state).
 * Spec: docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md
 *
 * The user_role_v2 enum holds the v3 values only: resident, property_manager,
 * root_manager (the `CommunityRole` vocabulary). Every DB-level role predicate
 * AND every app-layer branch on a raw membership.role value matches these via
 * the tier constants below.
 * The _DB_ infix means "raw user_role_v2 enum values" — as opposed to the
 * legacy-NAME arrays in access-policies.ts (ADMIN_ROLES etc.), which hold
 * MatrixRole row-key strings.
 */
import type { CommunityRole } from './index';

/** Admin-tier membership rows (manager or above). */
export const ADMIN_TIER_DB_ROLES = ['property_manager', 'root_manager'] as const;

/** Rows granting cross-community PM-portfolio scope. */
export const PM_SCOPE_DB_ROLES = ['property_manager', 'root_manager'] as const;

/** The v3 manager-generation roles (community-scoped manager + root). */
export const MANAGER_TIER_DB_ROLES = ['property_manager', 'root_manager'] as const;

/**
 * The root-exclusive tier (ADR-006 §2, role-v3 R3-03).
 *
 * ADR-006 names exactly four root-exclusive powers: role assignment, billing /
 * subscription, community deletion, and root transfer. They are a CLOSED SET of
 * named powers, not a permission dimension — the RBAC matrix deliberately
 * collapses `property_manager` and `root_manager` onto one `manager` row
 * (rbac-matrix.ts MATRIX_ROLES), so root-exclusivity cannot be, and should not
 * be, expressed as a matrix cell. Enforce it with `isRootManager` here (pure
 * predicate, safe for client components) or `requireRootManager` in
 * apps/web/src/lib/api/role-guard.ts (the throwing route guard).
 */
export const ROOT_ONLY_DB_ROLES = ['root_manager'] as const;

/**
 * Canonical root-manager predicate. Accepts `unknown`-ish input so it is safe to
 * call on a nullable membership role. NEVER reads `designation` — ADR-006 §2:
 * general permissions never key on board designation.
 */
export function isRootManager(role: CommunityRole | string | null | undefined): boolean {
  return role === 'root_manager';
}

/**
 * Expand a role-filter value to the matching enum rows. Returns [] for
 * unknown input — callers MUST short-circuit (drizzle forbids inArray(col, [])).
 * Legacy 7-role NAMES (cam, board_member, …) are not valid inputs here — those filters belong to the legacy-name path.
 */
export function expandTransitionRoleFilter(role: string): readonly CommunityRole[] {
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
 * The audience vocabulary of help content — help-article frontmatter `roles:`
 * and FAQ `roleVisibility`. CONTENT vocabulary, not runtime roles: a viewer
 * resolves to a SET of these (`resolveHelpViewerTokens` in apps/web), one base
 * audience (`manager` for property/root managers, `owner`/`tenant` for
 * residents) plus the board designation when they hold one.
 *
 * Tag content `board_*` ONLY where a board designation actually grants the
 * action it describes — elections admin, violation admin writes, community
 * export (`requireBoardDesignation`, `isExportEligible`). Everywhere else a
 * board member is just an owner or tenant: tagging admin how-tos `board_*`
 * shows residents instructions that end in a 403.
 *
 * Lives in this guard-exempt module because the two board values are the
 * designation strings, which `guard:legacy-roles` would count elsewhere.
 */
export const HELP_AUDIENCES = ['manager', 'owner', 'tenant', ...BOARD_DESIGNATIONS] as const;
export type HelpAudience = (typeof HELP_AUDIENCES)[number];

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
