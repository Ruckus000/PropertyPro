/**
 * Subscription guard — P2-34a
 *
 * Enforces subscription status for admin mutation routes.
 * Called explicitly in write route handlers — NOT applied as global middleware —
 * to allow fine-grained control (webhooks, public reads are exempt).
 *
 * Degradation rules:
 *   active / trialing / null → allowed (null = new community, not yet provisioned)
 *   past_due               → allowed (banner shown at UI level only)
 *   free_access_expires_at > now → allowed (overrides locked status, see spec §4.2)
 *   canceled / expired / unpaid → throws 403 SUBSCRIPTION_REQUIRED
 */
import { eq } from '@propertypro/db/filters';
import { communities } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { AppError } from '@/lib/api/errors/AppError';

const LOCKED_STATUSES = new Set(['canceled', 'expired', 'unpaid', 'incomplete_expired']);

/**
 * Verify that the community's subscription allows admin mutations.
 * Throws AppError(403, 'SUBSCRIPTION_REQUIRED') if locked.
 */
export async function requireActiveSubscriptionForMutation(
  communityId: number,
): Promise<void> {
  const db = createUnscopedClient();
  const rows = await db
    .select({
      subscriptionStatus: communities.subscriptionStatus,
      freeAccessExpiresAt: communities.freeAccessExpiresAt,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  const status = rows[0]?.subscriptionStatus ?? null;
  const freeAccessExpiresAt = rows[0]?.freeAccessExpiresAt ?? null;

  // Free access overrides locked subscription status (see spec §4.2)
  if (freeAccessExpiresAt && freeAccessExpiresAt > new Date()) {
    return;
  }

  // Treat unknown/null status as active (fail-open for new/unprovisioned communities)
  if (status !== null && LOCKED_STATUSES.has(status)) {
    throw new AppError(
      'Your subscription is no longer active. Please reactivate to continue.',
      403,
      'SUBSCRIPTION_REQUIRED',
      { subscriptionStatus: status },
    );
  }
}
