/**
 * The one role-visibility gate for navigation surfaces (roadmap 2.9 / INF-02).
 *
 * The sidebar (`nav-config.ts`) and the command palette / mobile search
 * (`feature-registry.ts`) each carried their own copy of this rule over their
 * own union. They agreed on every role but one case: with NO role, the
 * sidebar's copy let admin-gated items through while the registry's hid them,
 * and `app-sidebar.tsx` had to filter them out again downstream. One function
 * means the two can no longer disagree.
 *
 * - `'all'`: every viewer, including one with no role yet.
 * - `'admin'`: management tier only (`property_manager` / `root_manager`).
 * - `'owner_or_admin'`: unit owners + management tier (finance-read surfaces).
 *
 * A gated item with no role fails closed. This is display only — every route
 * behind these links enforces its own gate.
 */
import { isAdminRole, type CommunityRole } from '@propertypro/shared';

export type RoleVisibility = 'all' | 'admin' | 'owner_or_admin';

export function matchesRoleVisibility(
  gate: RoleVisibility,
  role: CommunityRole | null,
  isUnitOwner?: boolean,
): boolean {
  if (gate === 'all') return true;
  if (!role) return false;
  const admin = isAdminRole(role);
  if (gate === 'owner_or_admin') return admin || isUnitOwner === true;
  return admin; // 'admin'
}
