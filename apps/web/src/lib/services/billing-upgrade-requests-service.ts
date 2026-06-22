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
import { PM_SCOPE_DB_ROLES } from '@propertypro/shared';

/**
 * Return the set of user ids in this community who are authorized to act on
 * a plan-upgrade request: the PM-scope roles (property_manager / root_manager).
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
    const recipientId = typeof row['userId'] === 'string' ? row['userId'] : null;
    if (!recipientId) continue;
    if (recipientId === excludeUserId) continue;
    if ((PM_SCOPE_DB_ROLES as readonly string[]).includes(role)) {
      recipientIds.add(recipientId);
    }
  }
  return [...recipientIds];
}
