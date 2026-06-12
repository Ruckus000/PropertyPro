/**
 * Billing Upgrade Requests Service
 *
 * Wraps the user-roles lookup that finds the billing-capable recipients of a
 * plan-upgrade request, so the route handler doesn't import the
 * `user_roles` table directly (Plan A3 third-boundary-guard compliance).
 *
 * Companion to:
 *   - apps/web/src/app/api/v1/billing/upgrade-requests/route.ts
 */
import { createScopedClient, userRoles } from '@propertypro/db';
import { MANAGER_TIER_DB_ROLES, PM_SCOPE_DB_ROLES, isBoardPresident } from '@propertypro/shared';

/**
 * Return the set of user ids in this community who are authorized to act on
 * a plan-upgrade request:
 *   - PM-scope role (pm_admin / property_manager / root_manager)           → always
 *   - manager-tier role (manager / property_manager / root_manager) AND
 *     (board-president designation OR legacy cam preset)                   → yes
 *
 * Excludes `excludeUserId` (the requester) so they don't get notified about
 * their own request. Returns a plain array for ergonomic callers.
 *
 * Caller MUST authorize via `requireCommunityMembership` before invoking.
 */
export async function listBillingCapableUserIds(
  communityId: number,
  excludeUserId: string,
): Promise<string[]> {
  const scoped = createScopedClient(communityId);
  const candidateRows = (await scoped.selectFrom(userRoles, {})) as unknown as Record<
    string,
    unknown
  >[];

  const recipientIds = new Set<string>();
  for (const row of candidateRows) {
    const role = String(row['role']);
    const presetKey = typeof row['presetKey'] === 'string' ? row['presetKey'] : '';
    const recipientId = typeof row['userId'] === 'string' ? row['userId'] : null;
    if (!recipientId) continue;
    if (recipientId === excludeUserId) continue;
    // BILINGUAL (role-v3): collapse to v3-only at Phase 4 cleanup.
    // Phase 3.2: the president arm sources from designation; the cam-preset
    // arm survives only for hypothetical legacy manager rows and dies in 3.3.
    if ((PM_SCOPE_DB_ROLES as readonly string[]).includes(role)) {
      recipientIds.add(recipientId);
    } else if (
      (MANAGER_TIER_DB_ROLES as readonly string[]).includes(role) &&
      (isBoardPresident(row['designation']) || presetKey === 'cam')
    ) {
      recipientIds.add(recipientId);
    }
  }
  return [...recipientIds];
}
