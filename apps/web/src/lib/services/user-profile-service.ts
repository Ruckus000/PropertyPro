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
import { eq, sql } from '@propertypro/db/filters';
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

export interface UserProfileSnapshot {
  fullName: string | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
}

/**
 * Read the user's current name/phone state. Used ONLY to record the "before"
 * values of a change an operator makes during a support session (see
 * lib/support/support-audit.ts) — outside a support session no route calls it,
 * so the ordinary self-service paths gain no extra query.
 *
 * Same authorization contract as `updateUserProfile`: the caller passes the
 * actor's own id (the impersonated user's, under a support session).
 */
export async function getUserProfileSnapshot(userId: string): Promise<UserProfileSnapshot> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({
      fullName: users.fullName,
      phone: users.phone,
      phoneVerifiedAt: users.phoneVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return {
    fullName: row?.fullName ?? null,
    phone: row?.phone ?? null,
    phoneVerifiedAt: row?.phoneVerifiedAt ?? null,
  };
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
    // A new number is unverified until it goes through phone/verify: keep
    // phoneVerifiedAt only when the number is unchanged (the form may resend
    // the same phone on a name-only edit). Without this, a PATCH could point
    // "verified" emergency SMS at a number nobody confirmed.
    updateValues['phoneVerifiedAt'] = sql`case when ${users.phone} is not distinct from ${patch.phone} then ${users.phoneVerifiedAt} else null end`;
    changedFields.phone = patch.phone;
  }

  const db = createUnscopedClient();
  await db.update(users).set(updateValues).where(eq(users.id, userId));

  return { updatedAt, changedFields };
}
