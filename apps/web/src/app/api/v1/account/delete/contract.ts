/**
 * Route contracts for `GET`, `POST`, and `DELETE /api/v1/account/delete`.
 *
 * Plan A1 drain #160. Session-anchored account lifecycle — user checks,
 * requests, or cancels their own deletion. No `communityId` on the wire.
 *
 * GET/POST responses are `z.unknown()` — lifecycle rows carry `Date` fields
 * (`coolingEndsAt`, etc.).
 *
 * `permission: { resource: 'settings', action: 'read'|'write' }` documents
 * intent; the runner does not enforce it — session auth + `requireFreshReauth`
 * on POST are the real gates.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const accountDeleteGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/account/delete',
  request: {},
  response: z.unknown(),
  permission: { resource: 'settings', action: 'read' },
});

export const accountDeletePostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/account/delete',
  request: {
    // R3-03b: when the caller holds `root_manager` anywhere, the first attempt
    // returns 409 ROOT_OFFBOARDING_ACK_REQUIRED listing the affected
    // communities; the client re-submits with this flag set. Optional so the
    // overwhelmingly common case (user holds no root) sends no body at all —
    // `.optional()` on the object keeps existing bodyless callers valid.
    body: z
      .object({ acknowledgeRootOffboarding: z.boolean().optional() })
      .optional(),
  },
  response: z.unknown(),
  permission: { resource: 'settings', action: 'write' },
});

export const accountDeleteDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/account/delete',
  request: {},
  response: z.object({
    cancelled: z.literal(true),
  }),
  permission: { resource: 'settings', action: 'write' },
});
