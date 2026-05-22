/**
 * Route contract for `PATCH /api/v1/notifications/read`.
 *
 * Plan A1 drain #7 — mirrors drain #4's body-parsing shape; introduces
 * a Zod discriminated-union body (`{ ids: number[] }` XOR `{ all: true }`,
 * both with `communityId`) to the drain corpus.
 *
 * Authorization is tenant-scoped: the route handler reconciles the body's
 * `communityId` via `resolveEffectiveCommunityId(req, body.communityId)` and
 * then enforces `requireCommunityMembership`. There is no admin gate — any
 * member of the community may mark their own notifications read.
 *
 * `permission: { resource: 'settings', action: 'write' }` is a documented
 * placeholder. `RBAC_RESOURCES` doesn't currently include a `notifications`
 * resource; the runner doesn't enforce this field today (A1 metadata only).
 * The chosen placeholder mirrors drain #4 (PATCH side) since both are
 * tenant-scoped writes with no narrower fit in the existing RBAC table.
 *
 * Body schema: semantically a true discriminated union (mutually exclusive
 * `ids` vs `all`), but Zod's `z.union(...)` is correct here — NOT
 * `z.discriminatedUnion(...)`. The two branches don't share a single
 * literal-typed discriminator KEY at the same path; they differ by which
 * field is present. `z.union` issues a slightly less specific error message
 * on validation failure, which is acceptable for this endpoint.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const bodySchema = z.union([
  z.object({
    communityId: z.number().int().positive(),
    ids: z.array(z.number().int().positive()).min(1),
  }),
  z.object({
    communityId: z.number().int().positive(),
    all: z.literal(true),
  }),
]);

export const notificationsReadContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/notifications/read',
  request: {
    body: bodySchema,
  },
  response: z.object({ ok: z.literal(true) }),
  permission: { resource: 'settings', action: 'write' },
});
