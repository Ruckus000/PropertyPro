/**
 * Role-based behavior for plan-gated features (v3-native, ADR-006).
 *
 * Three audiences:
 *   - Management tier (`property_manager` / `root_manager`) can purchase upgrades.
 *   - Unit owners (`resident` + `isUnitOwner`) can request an upgrade by
 *     notifying billing admins, but can't purchase.
 *   - Tenants (`resident`, not a unit owner) don't see locked features at all —
 *     they're filtered from the nav.
 *
 * ADR-006 §2: general permissions NEVER read `designation`. Billing is a general
 * permission, so this module keys ONLY on the v3 role (+ `isUnitOwner` to split
 * owner from tenant). A board designation never changes a member's billing
 * capability — that is why the v3→legacy bridge shim was removed: it let a
 * `board_member` designation strip an operational manager's billing-admin power.
 */
import type { AnyCommunityRole } from '../index';

export type LockedFeatureBehavior = 'upgrade' | 'request' | 'hidden';

/**
 * Management-tier predicate. Only the two v3 manager roles qualify; residents
 * (owner or tenant) never do. Runtime roles are always v3 — a legacy string
 * simply falls through to `false`.
 */
function isManagementTier(role: AnyCommunityRole | null): boolean {
  return role === 'property_manager' || role === 'root_manager';
}

/** Management tier can purchase plan upgrades. Never gated on `designation`. */
export function canManageBilling(role: AnyCommunityRole | null): boolean {
  return isManagementTier(role);
}

/**
 * Everyone except tenants can request an upgrade (notify billing admins).
 * Management tier and unit owners → true; tenants (resident, not owner) → false.
 */
export function canRequestUpgrade(
  role: AnyCommunityRole | null,
  isUnitOwner?: boolean,
): boolean {
  if (!role) return false;
  if (isManagementTier(role)) return true;
  if (role === 'resident') return isUnitOwner === true;
  return false;
}

/**
 * Decide what happens when this member hits a plan-gated feature.
 *
 * `upgrade` — show "Upgrade now" CTA → Stripe checkout (management tier).
 * `request` — show "Notify your board" CTA (unit owners).
 * `hidden`  — filter the locked surface entirely (tenants).
 */
export function getLockedFeatureBehavior(
  role: AnyCommunityRole | null,
  isUnitOwner?: boolean,
): LockedFeatureBehavior {
  if (!role) return 'request';
  if (isManagementTier(role)) return 'upgrade';
  if (role === 'resident' && isUnitOwner !== true) return 'hidden'; // tenant
  return 'request'; // unit owner
}
