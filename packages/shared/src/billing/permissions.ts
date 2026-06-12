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
 * The runtime stores `role` as resident | manager | pm_admin — plus, during
 * the v3 transition window, property_manager | root_manager. This is THE
 * single legacy-role resolver (spec Phase 1); preset fidelity is preserved
 * for backfilled property_managers so legacy permission semantics survive
 * the window. Phase 4 deletes this function.
 * (NB: distinct from the private `resolveLegacyRole` helper in
 * `access-policies.ts`, which serves document-access policies.)
 */
export function inferCanonicalRoleFromMembership(input: {
  role: string;
  isUnitOwner?: boolean;
  presetKey?: string | null;
  designation?: string | null;
}): AnyCommunityRole {
  if (input.role === 'pm_admin' || input.role === 'root_manager') return 'property_manager_admin';
  if (input.role === 'manager' || input.role === 'property_manager') {
    // Phase 3.2: designation is the source of truth for board membership;
    // the presetKey board cases below are the bilingual fallback for callers
    // not yet passing designation, and die with this whole function in Phase 4.
    if (input.designation === 'board_president') return 'board_president';
    if (input.designation === 'board_member') return 'board_member';
    switch (input.presetKey) {
      case 'board_president': return 'board_president';
      case 'cam': return 'cam';
      case 'site_manager': return 'site_manager';
      case 'board_member': return 'board_member';
      // property_manager rows without a presetKey are root-minted operational managers (Phase 2+); cam is the correct legacy analog — do not "symmetrize" this to board_member.
      default: return input.role === 'property_manager' ? 'cam' : 'board_member';
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
