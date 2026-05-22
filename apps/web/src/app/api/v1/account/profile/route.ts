/**
 * Account Profile API
 *
 * PATCH /api/v1/account/profile — update the current user's name and/or phone
 *
 * Plan A1 drain #9. Mirrors drain #4 (community/contact PATCH) in shape
 * — body parsing through `runRoute()` from `@propertypro/api-contract`
 * — but is SESSION-ANCHORED: no tenant context, no
 * `requireCommunityMembership`. The actor can only mutate their own
 * users-table row.
 *
 * Invariants:
 * - withErrorHandler wrapper (structured errors, request ID)
 * - Auth via `requireAuthenticatedUserId` (user-scoped, no community context)
 * - Users table is NOT tenant-scoped — service uses `createUnscopedClient`
 * - Syncs `full_name` to Supabase `user_metadata` via admin client (route
 *   concern, preserved verbatim from pre-migration)
 * - No audit log: profile updates are user-scoped, not community-scoped,
 *   and the compliance_audit_log table requires a community FK. Profile
 *   changes are tracked in Supabase `user_metadata`.
 *
 * Authorization contract: the authenticated user can only update their
 * own row. No community membership is required — this is a user-level
 * operation.
 *
 * Preserved verbatim from pre-migration:
 *   - The "at least one field" runtime guard fires AFTER
 *     `requireAuthenticatedUserId` and AFTER the Zod body parse, so an
 *     unauthenticated empty-update still returns 401 (not 400) and a
 *     body that parses to `{}` still returns the same 400
 *     'No fields to update'.
 *   - The Supabase admin auth sync is conditional on truthy `fullName`
 *     (i.e. fires for any non-empty string; does NOT fire for `phone`-
 *     only updates). Same `createAdminClient()` call, same
 *     `updateUserById(userId, { user_metadata: { full_name } })`.
 *
 * Behavior changes vs. pre-migration:
 *   - Invalid body shape now returns the runner's `VALIDATION_ERROR`
 *     envelope with per-field details (was: hand-constructed
 *     `ValidationError` with the message
 *     `'Invalid profile update payload'`). Same 400 status.
 *   - Empty body / missing JSON now also returns `VALIDATION_ERROR`
 *     (the runner's `parseBody` catches the `req.json()` failure and
 *     hands `undefined` to `safeParse`, which still rejects it via the
 *     body schema). Same 400 status.
 *
 * Response wire shape is unchanged: `{ data: { userId, updatedAt,
 * ...changedFields } }`. The hook consumer (`useUpdateProfile` in
 * `apps/web/src/hooks/use-account-settings.ts`) only reads `res.ok`, so
 * even the envelope/error-shape changes are consumer-invisible.
 */
import { runRoute } from '@propertypro/api-contract';
import { createAdminClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { updateUserProfile } from '@/lib/services/user-profile-service';
import { accountProfilePatchContract } from './contract';

export const PATCH = withErrorHandler(
  runRoute(accountProfilePatchContract, async ({ body }) => {
    const userId = await requireAuthenticatedUserId();
    const { fullName, phone } = body;

    if (fullName === undefined && phone === undefined) {
      throw new ValidationError('No fields to update');
    }

    const { updatedAt, changedFields } = await updateUserProfile(userId, {
      fullName,
      phone,
    });

    // Sync full_name to Supabase user_metadata for auth display.
    // Conditional on truthy fullName — identical to pre-migration.
    if (fullName) {
      const admin = createAdminClient();
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: { full_name: fullName },
      });
    }

    return {
      userId,
      updatedAt: updatedAt.toISOString(),
      ...changedFields,
    };
  }),
);
