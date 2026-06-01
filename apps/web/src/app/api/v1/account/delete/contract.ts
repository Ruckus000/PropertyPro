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
  request: {},
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
