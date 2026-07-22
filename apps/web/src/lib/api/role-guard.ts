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
