/**
 * Notification Preferences Service
 *
 * Tenant-scoped lookups + writes for the per-(community, user)
 * `notification_preferences` row backing /api/v1/notification-preferences
 * (GET + PATCH).
 *
 * Pre-A3-drain-#61 the GET handler used `scoped.query(notificationPreferences)`
 * + JS `.find()` to load every community-row just to read one user's
 * preferences. Replaced with a one-row `selectFrom` lookup here. Same class
 * of fix as drains #244/#287/#292/#295/#60.
 */
import {
  createScopedClient,
  notificationPreferences,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

/**
 * One-row preferences lookup by `userId`. Returns the raw row record
 * (loosely typed since `selectFrom` returns `Record<string, unknown>`)
 * or `null` when no row matches — the route then applies its own
 * defaulting/projection over the columns it consumes.
 */
export async function getNotificationPreferencesForUser(
  communityId: number,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    notificationPreferences,
    {},
    eq(notificationPreferences.userId, userId),
  )) as unknown as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

/**
 * Insert a new preferences row. `userId` is included in the inserted
 * payload alongside the caller-provided `updateValues`.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership.
 */
export async function insertNotificationPreferences(
  communityId: number,
  userId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.insert(notificationPreferences, {
    userId,
    ...values,
  });
}

/**
 * Update a user's existing preferences row in-place. Caller MUST have
 * confirmed the row exists (typically by calling
 * `getNotificationPreferencesForUser` first).
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership.
 */
export async function updateNotificationPreferences(
  communityId: number,
  userId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.update(
    notificationPreferences,
    values,
    eq(notificationPreferences.userId, userId),
  );
}
