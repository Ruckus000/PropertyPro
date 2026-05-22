/**
 * Route contract for `PATCH /api/v1/account/profile`.
 *
 * Plan A1 drain #9 — mirrors drain #4 (community/contact PATCH): body
 * parsing through the runner with an object response. Differs in being
 * SESSION-ANCHORED (no tenant context, no `requireCommunityMembership`,
 * no `resolveEffectiveCommunityId`) — the actor can only mutate their
 * own users-table row.
 *
 * Two preservations the contract DOES NOT model:
 *
 *  1. The route ALSO performs a Supabase admin auth sync of `full_name`
 *     into the user's `user_metadata` whenever `fullName` is provided.
 *     That is a route-side effect (`createAdminClient().auth.admin
 *     .updateUserById(...)`), not a contract concern, and the runner is
 *     blind to it.
 *
 *  2. The "at least one field" guard (`fullName === undefined &&
 *     phone === undefined → 'No fields to update'`) stays in the route
 *     handler. Expressing it in the Zod body schema would require
 *     `.refine()`, which surfaces as a whole-object-level Zod error and
 *     muddies the runner's per-field error reporting. Keeping the guard
 *     in the handler also preserves the pre-migration ordering: the
 *     check fires AFTER `requireAuthenticatedUserId`, so an
 *     unauthenticated empty-update still returns 401 (not 400) —
 *     identical to the pre-migration handler.
 *
 * `permission: { resource: 'settings', action: 'write' }` is a
 * placeholder. `RBAC_RESOURCES` has no `account` / `self` / `profile`
 * resource (the users table is platform-level, not tenant-scoped), and
 * the runner does not enforce `permission` — this is metadata only.
 * `settings/write` is the closest semantic match (drain #4 reused the
 * same pair for community contact writes).
 */
import { defineRoute, z } from '@propertypro/api-contract';

/**
 * PATCH body shape. Verbatim from the pre-migration `patchSchema`:
 *   - `fullName`: optional, non-empty when provided, capped at 200 chars
 *   - `phone`: optional, capped at 30 chars, `null` clears it
 *
 * Zod's `.nullable().optional()` on `phone` gives the three-state
 * semantics callers depend on:
 *   - omit `phone`          → don't touch
 *   - `phone: null`         → clear it
 *   - `phone: "555-0100"`   → set it
 */
export const accountProfilePatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/account/profile',
  request: {
    body: z.object({
      fullName: z.string().min(1, 'Name is required').max(200).optional(),
      phone: z.string().max(30).nullable().optional(),
    }),
  },
  /**
   * Response payload echoed back to the client. `updatedAt` is the ISO
   * timestamp of the bumped `updated_at` column — the route converts the
   * service's `Date` to an ISO string before returning so the schema is
   * a plain `z.string()` (matches the pre-`runRoute` wire shape, where
   * `NextResponse.json` would have stringified the Date the same way).
   *
   * `fullName` / `phone` are echoed back only when the corresponding
   * field was sent in the request (the service's `changedFields` only
   * contains keys that were actually patched). Hence both are
   * `.optional()`; `phone` is also `.nullable()` so the "clear-via-null"
   * case round-trips faithfully.
   */
  response: z.object({
    userId: z.string(),
    updatedAt: z.string(),
    fullName: z.string().optional(),
    phone: z.string().nullable().optional(),
  }),
  permission: { resource: 'settings', action: 'write' },
});

export type AccountProfilePatchResponse = z.infer<
  typeof accountProfilePatchContract.response
>;
