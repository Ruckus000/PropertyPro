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

/** Manager presets that get treated as billing admins. Mirrors `canManageBilling()`. */
const BILLING_ADMIN_PRESETS = new Set(['board_president', 'cam']);

/**
 * Return the set of user ids in this community who are authorized to act on
 * a plan-upgrade request:
 *   - role = 'pm_admin'                                                    → always
 *   - role = 'manager' AND presetKey IN ('board_president', 'cam')         → yes
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
    if (role === 'pm_admin') {
      recipientIds.add(recipientId);
    } else if (role === 'manager' && BILLING_ADMIN_PRESETS.has(presetKey)) {
      recipientIds.add(recipientId);
    }
  }
  return [...recipientIds];
}
