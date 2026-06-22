/**
 * PR #5: Role-gate helper for authenticated route handlers.
 *
 * Used in conjunction with requireCommunityMembership to enforce that the
 * caller holds one of the supplied roles in the resolved community. Throws
 * ForbiddenError when the caller's role is not in the allowlist.
 *
 * Aliases like `pm_admin` / `property_manager_admin` are accepted as
 * equivalent (per packages/shared/src/default-faqs.ts:15-17).
 */
import { ForbiddenError } from '@/lib/api/errors';

const ROLE_ALIASES: Record<string, readonly string[]> = {
  pm_admin: ['pm_admin', 'property_manager_admin', 'property_manager', 'root_manager'],
  property_manager_admin: ['pm_admin', 'property_manager_admin', 'property_manager', 'root_manager'],
  property_manager: ['pm_admin', 'property_manager_admin', 'property_manager', 'root_manager'],
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
