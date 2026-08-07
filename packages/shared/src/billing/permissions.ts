/**
 * Role-based behavior for plan-gated features (v3-native, ADR-006).
 *
 * Four audiences (role-v3 R3-03 narrowed the first two apart):
 *   - The `root_manager` can purchase upgrades. Billing is one of ADR-006's four
 *     root-exclusive powers, so this is root-only — NOT the management tier.
 *   - `property_manager` can VIEW billing (see `canViewBilling`) and request an
 *     upgrade, but not purchase. They get the same "notify" path as unit owners.
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
import type { CommunityRole } from '../index';
import { isRootManager } from '../role-transition';

export type LockedFeatureBehavior = 'upgrade' | 'request' | 'hidden';

/**
 * Management-tier predicate. Only the two v3 manager roles qualify; residents
 * (owner or tenant) never do. Runtime roles are always v3 — a legacy string
 * simply falls through to `false`.
 */
function isManagementTier(role: CommunityRole | null): boolean {
  return role === 'property_manager' || role === 'root_manager';
}

/**
 * Root-only: purchase/change a plan, open the Stripe portal, cancel.
 *
 * ADR-006 §2 makes billing/subscription one of four root-exclusive powers.
 * Deliberately NOT `isManagementTier` — a property manager must not be able to
 * move the community's money. The server-side fence is `requireRootManager`
 * (apps/web/src/lib/api/role-guard.ts); this predicate is the UI/feature-gate
 * half and the two must stay in agreement.
 *
 * Never gated on `designation`.
 */
export function canManageBilling(role: CommunityRole | null): boolean {
  return isRootManager(role);
}

/**
 * Read-only visibility of the billing surface — the whole management tier.
 *
 * A property manager keeps SEEING plan, status and interval after R3-03; they
 * simply lose the actions. Hiding billing from them instead would make the
 * capability loss invisible and silently corrupt their mental model of who
 * owns the subscription.
 */
export function canViewBilling(role: CommunityRole | null): boolean {
  return isManagementTier(role);
}

/**
 * Everyone except tenants can request an upgrade (notify billing admins).
 * Management tier and unit owners → true; tenants (resident, not owner) → false.
 */
export function canRequestUpgrade(
  role: CommunityRole | null,
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
 * `upgrade` — show "Upgrade now" CTA → Stripe checkout (root manager only).
 * `request` — show the "notify" CTA (property managers and unit owners).
 * `hidden`  — filter the locked surface entirely (tenants).
 *
 * R3-03: a property manager falls to `request` rather than `upgrade`. That is
 * the point of routing them here — they get a working "ask the root manager"
 * path instead of an "Upgrade now" button that would dead-end in a 403.
 */
export function getLockedFeatureBehavior(
  role: CommunityRole | null,
  isUnitOwner?: boolean,
): LockedFeatureBehavior {
  if (!role) return 'request';
  if (isRootManager(role)) return 'upgrade';
  if (role === 'property_manager') return 'request';
  if (role === 'resident' && isUnitOwner !== true) return 'hidden'; // tenant
  return 'request'; // unit owner
}
