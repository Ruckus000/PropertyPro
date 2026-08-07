/**
 * PR #5: Role-gate helper for authenticated route handlers.
 *
 * Used in conjunction with requireCommunityMembership to enforce that the
 * caller holds one of the supplied roles in the resolved community. Throws
 * ForbiddenError when the caller's role is not in the allowlist.
 *
 * v3 (ADR-006): stored roles are `resident` / `property_manager` /
 * `root_manager`. Gating on `property_manager` also admits `root_manager`
 * (root is a superset of the operational manager tier).
 */
import { ForbiddenError } from '@/lib/api/errors';

/**
 * v3 property-manager tier — re-exported under the call-site name for use with
 * requireRole/hasRole. The single source of truth is the shared role-transition
 * const (role-v3 Phase 4.3).
 */
export { PM_SCOPE_DB_ROLES as PM_MANAGER_ROLES } from '@propertypro/shared';

const ROLE_ALIASES: Record<string, readonly string[]> = {
  property_manager: ['property_manager', 'root_manager'],
  root_manager: ['root_manager'],
};

export type Membership = { role: string; communityId: number };

function expandRoles(allowed: readonly string[]): Set<string> {
  const expanded = new Set<string>();
  for (const role of allowed) {
    expanded.add(role);
    for (const alias of ROLE_ALIASES[role] ?? []) {
      expanded.add(alias);
    }
  }
  return expanded;
}

export function hasRole(membership: Membership, allowed: readonly string[]): boolean {
  const expanded = expandRoles(allowed);
  return expanded.has(membership.role);
}

export function requireRole(
  membership: Membership,
  allowed: readonly string[],
  errorMessage = "You don't have permission to perform this action.",
): void {
  if (!hasRole(membership, allowed)) {
    throw new ForbiddenError(errorMessage);
  }
}

/**
 * Root-exclusive guard (ADR-006 §2, role-v3 R3-03).
 *
 * The four root-exclusive powers — role assignment, billing/subscription,
 * community deletion, root transfer — gate on THIS, never on
 * `requirePermission(membership, 'settings', 'write')`. The RBAC matrix
 * collapses `property_manager` and `root_manager` onto a single `manager` row,
 * so `settings:write` cannot distinguish them; using it for a root-exclusive
 * power silently admits every property manager.
 *
 * Note `ROLE_ALIASES` maps `property_manager -> [property_manager, root_manager]`
 * but `root_manager -> [root_manager]`, so this admits roots only — the
 * aliasing is deliberately one-way.
 *
 * The default message names the recovery path, because the legitimate way to
 * hit this is being a property manager in a community whose root seat is
 * vacant: claim-root is the fix, and a bare 403 would not say so.
 */
export function requireRootManager(
  membership: Membership,
  errorMessage = 'Only the root manager can perform this action. If this community has no root manager, a property manager can claim it from the dashboard.',
): void {
  requireRole(membership, ['root_manager'], errorMessage);
}
