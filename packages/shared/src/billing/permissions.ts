/**
 * Role-based behavior for plan-gated features.
 *
 * Three audiences:
 *   - Billing admins (board_president, cam, property_manager_admin) can purchase upgrades.
 *   - Other community members (owner, board_member, site_manager) can request an upgrade
 *     by notifying billing admins, but can't purchase.
 *   - Tenants don't see locked features at all — they're filtered from the nav.
 *
 * The v3 role model (`resident` / `property_manager` / `root_manager`) maps onto
 * the canonical CommunityRole via `inferCanonicalRoleFromMembership`:
 *   - `root_manager` → property_manager_admin (→ upgrade)
 *   - `property_manager` → board_president / board_member (by designation) or cam
 *   - `resident` → owner / tenant (by isUnitOwner)
 */
import type { AnyCommunityRole, CommunityRole } from '../index';

const BILLING_ADMIN_ROLES: readonly CommunityRole[] = [
  'board_president',
  'cam',
  'property_manager_admin',
];

export type LockedFeatureBehavior = 'upgrade' | 'request' | 'hidden';

/**
 * Resolve the canonical CommunityRole from the v3 membership shape.
 *
 * The runtime stores `role` as resident | property_manager | root_manager.
 * Board membership is sourced from `designation`; an operational
 * property_manager with no designation maps to `cam` (its billing-admin
 * legacy analog). residents split owner/tenant via isUnitOwner.
 * (NB: distinct from the private `resolveLegacyRole` helper in
 * `access-policies.ts`, which serves document-access policies.)
 */
export function inferCanonicalRoleFromMembership(input: {
  role: string;
  isUnitOwner?: boolean;
  designation?: string | null;
}): AnyCommunityRole {
  if (input.role === 'root_manager') return 'property_manager_admin';
  if (input.role === 'property_manager') {
    if (input.designation === 'board_president') return 'board_president';
    if (input.designation === 'board_member') return 'board_member';
    return 'cam'; // operational PM → cam legacy analog (billing-admin); do not symmetrize to board_member
  }
  return input.isUnitOwner ? 'owner' : 'tenant';
}

export function canManageBilling(role: AnyCommunityRole | null): boolean {
  if (!role) return false;
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
