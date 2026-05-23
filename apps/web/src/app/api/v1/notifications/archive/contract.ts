/**
 * Route contract for `PATCH /api/v1/notifications/archive`.
 *
 * Plan A1 drain #17 — body-only PATCH mirroring drain #7
 * (`notifications/read`), but with a flat (non-union) body shape:
 * `{ communityId, ids: number[] }`. Simpler than drain #7 because there is no
 * "archive all" branch — clients must pass an explicit, non-empty `ids` list.
 *
 * Authorization is tenant-scoped: the route handler reconciles the body's
 * `communityId` via `resolveEffectiveCommunityId(req, body.communityId)` and
 * then enforces `requireCommunityMembership`. There is no admin gate — any
 * member of the community may archive their own notifications.
 *
 * `permission: { resource: 'settings', action: 'write' }` is a documented
 * placeholder. `RBAC_RESOURCES` doesn't currently include a `notifications`
 * resource; the runner doesn't enforce this field today (A1 metadata only).
 * The chosen placeholder mirrors drain #7 (which also archives/mutates
 * tenant-scoped per-user state with no narrower fit in the existing RBAC
 * table).
 *
 * Response modeling: tight `z.object({ ok: z.literal(true) })` is safe here
 * because the inner payload is a single literal-shaped object with no
 * `Date` fields or index signatures (contrast with drain #14, where the
 * service returned a `PollRecord` with `Date` fields and `z.unknown()` was
 * the correct choice). The runner wraps this as `{ data: { ok: true } }`
 * on the wire — byte-identical to the pre-migration response envelope.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const notificationsArchiveContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/notifications/archive',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      ids: z.array(z.number().int().positive()).min(1),
    }),
  },
  response: z.object({ ok: z.literal(true) }),
  permission: { resource: 'settings', action: 'write' },
});
