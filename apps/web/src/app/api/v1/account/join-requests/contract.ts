/**
 * Route contracts for `GET` and `POST /api/v1/account/join-requests`.
 *
 * Plan A1 drain #151. Session-anchored join-request submit + list.
 *
 * POST auth: requireAuthenticatedUserId → per-user rate limit (5/day) →
 *   checkJoinRequestEligibility → createJoinRequest. Preserves ConflictError
 *   with `details.reason` for consumer-friendly messages in useCreateJoinRequest.
 *
 * GET auth: requireAuthenticatedUserId → listJoinRequestsForUser. Empty
 * `request.query` — no tenant context (user-scoped cross-community list).
 *
 * GET response: `z.array(z.unknown())` — rows include Date fields from DB.
 * POST response: `{ requestId, status }` — tight ack shape.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const createJoinRequestBodySchema = z.object({
  communityId: z.number().int().positive(),
  unitIdentifier: z.string().trim().min(1).max(50),
  residentType: z.enum(['owner', 'tenant']),
});

export const accountJoinRequestsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/account/join-requests',
  request: {},
  response: z.array(z.unknown()),
  permission: { resource: 'settings', action: 'read' },
});

export const accountJoinRequestsCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/account/join-requests',
  request: {
    body: createJoinRequestBodySchema,
  },
  response: z.object({
    requestId: z.number().int().positive(),
    status: z.string(),
  }),
  permission: { resource: 'settings', action: 'write' },
});
