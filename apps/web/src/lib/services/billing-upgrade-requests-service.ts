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
import { PM_SCOPE_DB_ROLES, isRootManager } from '@propertypro/shared';

/**
 * Return the set of user ids in this community who are authorized to act on
 * a plan-upgrade request.
 *
 * R3-03 narrowed billing to the root manager, so the root is the correct
 * recipient — they are the only member who can actually complete the purchase.
 *
 * FALLBACK, and it is load-bearing: when the community's root seat is VACANT,
 * fall back to the PM-scope roles. Without it a rootless community produces
 * zero recipients, and the route reports `{ notified: 0 }` with a 200 — a
 * silent black hole in exactly the communities most likely to hit it (a
 * rootless community is precisely where nobody can purchase yet). Notifying the
 * property managers is right in that case: they are the ones who can claim root
 * and then act on the request.
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

  const rootIds = new Set<string>();
  const pmScopeIds = new Set<string>();
  // Root presence is computed over ALL rows, before the requester exclusion —
  // a root who requests their own upgrade still means the seat is filled, and
  // must not trigger the rootless fallback.
  let communityHasRoot = false;

  for (const row of candidateRows) {
    const role = String(row['role']);
    if (isRootManager(role)) communityHasRoot = true;

    const recipientId = typeof row['userId'] === 'string' ? row['userId'] : null;
    if (!recipientId) continue;
    if (recipientId === excludeUserId) continue;

    if (isRootManager(role)) {
      rootIds.add(recipientId);
    }
    if ((PM_SCOPE_DB_ROLES as readonly string[]).includes(role)) {
      pmScopeIds.add(recipientId);
    }
  }

  return communityHasRoot ? [...rootIds] : [...pmScopeIds];
}
