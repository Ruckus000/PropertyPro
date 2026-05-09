/**
 * User Profile Service
 *
 * Wraps mutations to the platform-level `users` table so route handlers
 * don't import it directly (Plan A3 third-boundary-guard compliance — see
 * `docs/audits/a3-third-boundary-guard-survey-2026-05-08.md`).
 *
 * Authorization contract: the `users` table is NOT tenant-scoped. Callers
 * MUST authorize on user identity (e.g. via `requireAuthenticatedUserId`)
 * and MUST only mutate the actor's own row. The userId argument is treated
 * as the row to update.
 *
 * Companion to:
 *   - apps/web/src/app/api/v1/account/profile/route.ts
 */
import { users } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
// AUTHZ: User profile — user-scoped update (no community_id on users table)
import { createUnscopedClient } from '@propertypro/db/unsafe';

export interface UpdateUserProfilePatch {
  /** Full display name. Skipped when undefined. */
  fullName?: string;
  /** Phone number. Skipped when undefined. `null` clears it. */
  phone?: string | null;
}

export interface UpdatedUserProfile {
  /** The same `updatedAt` Date written to the row. */
  updatedAt: Date;
  /** The fields actually updated (excludes `updatedAt`). */
  changedFields: Partial<{ fullName: string; phone: string | null }>;
}

/**
 * Apply a partial update to the user's profile row. Always bumps
 * `updatedAt`. The returned `changedFields` mirrors the per-field
 * conditional inclusion semantics that the route's response payload
 * relied on pre-A3.
 *
 * Caller is responsible for:
 * - validating the payload shape (route does this with Zod)
 * - rejecting "nothing to update" requests (route throws ValidationError)
 * - syncing display-name changes to the auth provider (route does this
 *   via `createAdminClient`)
 */
export async function updateUserProfile(
  userId: string,
  patch: UpdateUserProfilePatch,
): Promise<UpdatedUserProfile> {
  const updatedAt = new Date();
  const updateValues: Record<string, unknown> = { updatedAt };
  const changedFields: Partial<{ fullName: string; phone: string | null }> = {};
  if (patch.fullName !== undefined) {
    updateValues['fullName'] = patch.fullName;
    changedFields.fullName = patch.fullName;
  }
  if (patch.phone !== undefined) {
    updateValues['phone'] = patch.phone;
    changedFields.phone = patch.phone;
  }

  const db = createUnscopedClient();
  await db.update(users).set(updateValues).where(eq(users.id, userId));

  return { updatedAt, changedFields };
}
