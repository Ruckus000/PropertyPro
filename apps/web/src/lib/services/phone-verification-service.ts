/**
 * Phone Verification Service
 *
 * Wraps reads/writes to the OTP-related columns on the platform-level
 * `users` table (otpLastSentAt, otpFailedAttempts, otpLockedUntil, phone,
 * phoneVerifiedAt) so route handlers don't import the table directly
 * (Plan A3 third-boundary-guard compliance).
 *
 * Authorization contract: the `users` table is NOT tenant-scoped. Every
 * helper accepts a `userId` argument and operates on that single row.
 * Callers MUST authorize via `requireAuthenticatedUserId` and ONLY pass
 * the actor's own id.
 *
 * Companion to:
 *   - apps/web/src/app/api/v1/phone/verify/send/route.ts
 *   - apps/web/src/app/api/v1/phone/verify/confirm/route.ts
 */
import { users } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
// AUTHZ: Phase 1B: Phone OTP verification — queries/updates users table (no community_id column)
import { createUnscopedClient } from '@propertypro/db/unsafe';

export interface UserOtpState {
  otpLastSentAt: Date | null;
  otpFailedAttempts: number | null;
  otpLockedUntil: Date | null;
}

/**
 * Read the OTP-related rate-limit state for a user. Returns all-nulls when
 * the row doesn't exist (matches the route's pre-A3 defensive `user?.X`
 * coalesce pattern). Used by both the send-cooldown and confirm-lockout
 * checks.
 */
export async function getUserOtpState(userId: string): Promise<UserOtpState> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({
      otpLastSentAt: users.otpLastSentAt,
      otpFailedAttempts: users.otpFailedAttempts,
      otpLockedUntil: users.otpLockedUntil,
    })
    .from(users)
    .where(eq(users.id, userId));
  return {
    otpLastSentAt: row?.otpLastSentAt ?? null,
    otpFailedAttempts: row?.otpFailedAttempts ?? null,
    otpLockedUntil: row?.otpLockedUntil ?? null,
  };
}

/**
 * Set `otpLastSentAt = now` (and bump `updatedAt`). Called after a successful
 * OTP send to start the cooldown timer.
 */
export async function markOtpSent(userId: string): Promise<void> {
  const now = new Date();
  const db = createUnscopedClient();
  await db
    .update(users)
    .set({ otpLastSentAt: now, updatedAt: now })
    .where(eq(users.id, userId));
}

export interface MarkOtpFailedInput {
  /** The new attempt count to persist. */
  newAttemptCount: number;
  /**
   * If provided, also set `otpLockedUntil` AND reset `otpFailedAttempts` to
   * 0 (so the lockout window is the only gate; once it expires, the user
   * starts with a fresh attempt budget). Caller decides when to engage the
   * lockout — typically when `newAttemptCount >= MAX_ATTEMPTS`.
   */
  lockoutUntil?: Date;
}

/**
 * Record a failed OTP-confirm attempt. When `lockoutUntil` is provided, the
 * helper resets `otpFailedAttempts` to 0 and sets `otpLockedUntil`; without
 * it, only the attempt counter is incremented. Always bumps `updatedAt`.
 */
export async function markOtpFailed(
  userId: string,
  input: MarkOtpFailedInput,
): Promise<void> {
  const now = new Date();
  const db = createUnscopedClient();
  if (input.lockoutUntil) {
    await db
      .update(users)
      .set({
        otpFailedAttempts: 0,
        otpLockedUntil: input.lockoutUntil,
        updatedAt: now,
      })
      .where(eq(users.id, userId));
  } else {
    await db
      .update(users)
      .set({ otpFailedAttempts: input.newAttemptCount, updatedAt: now })
      .where(eq(users.id, userId));
  }
}

/**
 * Record a successful OTP verification: persist the verified phone number,
 * set `phoneVerifiedAt = now`, and reset rate-limit state
 * (`otpFailedAttempts = 0`, `otpLockedUntil = null`). Always bumps
 * `updatedAt`.
 */
export async function markPhoneVerified(
  userId: string,
  phone: string,
): Promise<void> {
  const now = new Date();
  const db = createUnscopedClient();
  await db
    .update(users)
    .set({
      phone,
      phoneVerifiedAt: now,
      otpFailedAttempts: 0,
      otpLockedUntil: null,
      updatedAt: now,
    })
    .where(eq(users.id, userId));
}
