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
  pm_admin: ['pm_admin', 'property_manager_admin'],
  property_manager_admin: ['pm_admin', 'property_manager_admin'],
};

export type Membership = { role: string; communityId: number; presetKey?: string | null };

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
  if (expanded.has(membership.role)) {
    return true;
  }
  return membership.role === 'manager'
    && typeof membership.presetKey === 'string'
    && expanded.has(membership.presetKey);
}

export function requireRole(
  membership: Membership,
  allowed: readonly string[],
  errorMessage = 'Caller is not authorized for this action',
): void {
  if (!hasRole(membership, allowed)) {
    throw new ForbiddenError(errorMessage);
  }
}
