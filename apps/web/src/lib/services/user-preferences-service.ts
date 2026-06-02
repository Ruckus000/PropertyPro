/**
 * User Preferences Service
 *
 * Read/write per-user, platform-level key/value preferences (the
 * `user_preferences` table). NOT tenant-scoped — there is no community_id.
 *
 * Authorization contract: callers MUST authorize on user identity
 * (e.g. via `requireAuthenticatedUserId`) and only read/write the actor's
 * own rows. The `userId` argument IS the owning user. Mirrors
 * user-profile-service.ts for the `users` table.
 */
import { userPreferences } from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';
// AUTHZ: User preferences — user-scoped (no community_id); caller verifies identity.
import { createUnscopedClient } from '@propertypro/db/unsafe';

/**
 * Returns the stored JSON value for `(userId, key)`, or `null` when the
 * preference has never been set.
 */
export async function getUserPreference(userId: string, key: string): Promise<unknown> {
  const db = createUnscopedClient();
  const rows = await db
    .select({ value: userPreferences.value })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.preferenceKey, key)))
    .limit(1);
  return rows[0]?.value ?? null;
}

/**
 * Upserts the preference value for `(userId, key)`, bumping `updatedAt`.
 */
export async function setUserPreference(userId: string, key: string, value: unknown): Promise<void> {
  const db = createUnscopedClient();
  const now = new Date();
  await db
    .insert(userPreferences)
    .values({
      userId,
      preferenceKey: key,
      value: value as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.preferenceKey],
      set: { value: value as Record<string, unknown>, updatedAt: now },
    });
}
