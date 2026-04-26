/**
 * Role-based behavior for plan-gated features.
 *
 * Three audiences:
 *   - Billing admins (board_president, cam, property_manager_admin) can purchase upgrades.
 *   - Other community members (owner, board_member, site_manager) can request an upgrade
 *     by notifying billing admins, but can't purchase.
 *   - Tenants don't see locked features at all — they're filtered from the nav.
 *
 * The new 4-role model (`resident` / `manager` / `pm_admin`) is mapped here too:
 *   - `pm_admin` → upgrade
 *   - `manager`  → request (specific preset can elevate to upgrade — use presetKey-aware
 *      helpers downstream when the manager preset is known)
 *   - `resident` → request (we can't tell tenant vs owner from `resident` alone, so
 *      conservatively allow request-flow; use the tighter `getLockedFeatureBehavior`
 *      via `CommunityRole` whenever possible)
 */
import type { AnyCommunityRole, CommunityRole } from '../index';

const BILLING_ADMIN_ROLES: readonly CommunityRole[] = [
  'board_president',
  'cam',
  'property_manager_admin',
];

export type LockedFeatureBehavior = 'upgrade' | 'request' | 'hidden';

/**
 * Resolve the canonical CommunityRole from the new-model membership shape.
 *
 * The runtime stores `role` as `resident | manager | pm_admin`, and the
 * preset key + isUnitOwner discriminate further. We derive the legacy
 * canonical role string here so plan-gate logic and copy can branch on it
 * without each call site re-deriving the mapping.
 */
export function inferCanonicalRoleFromMembership(input: {
  role: string;
  isUnitOwner?: boolean;
  presetKey?: string | null;
}): AnyCommunityRole {
  if (input.role === 'pm_admin') return 'property_manager_admin';
  if (input.role === 'manager') {
    switch (input.presetKey) {
      case 'board_president': return 'board_president';
      case 'cam': return 'cam';
      case 'site_manager': return 'site_manager';
      case 'board_member': return 'board_member';
      default: return 'board_member';
    }
  }
  return input.isUnitOwner ? 'owner' : 'tenant';
}

export function canManageBilling(role: AnyCommunityRole | null): boolean {
  if (!role) return false;
  if (role === 'pm_admin') return true;
  return (BILLING_ADMIN_ROLES as readonly string[]).includes(role);
}

export function canRequestUpgrade(role: AnyCommunityRole | null): boolean {
  if (!role) return false;
  if (role === 'tenant') return false;
  return true;
}

/**
 * Decide what happens when this role hits a plan-gated feature.
 *
 * `upgrade` — show "Upgrade now" CTA → Stripe checkout.
 * `request` — show "Notify your board" CTA.
 * `hidden`  — filter the locked surface entirely (tenants).
 */
export function getLockedFeatureBehavior(
  role: AnyCommunityRole | null,
): LockedFeatureBehavior {
  if (!role) return 'request';
  if (canManageBilling(role)) return 'upgrade';
  if (role === 'tenant') return 'hidden';
  return 'request';
}
