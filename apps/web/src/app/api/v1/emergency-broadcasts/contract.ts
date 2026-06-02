/**
 * Route contracts for `GET` and `POST /api/v1/emergency-broadcasts`.
 *
 * Plan A1 drain #114. Paginated list + create draft broadcast.
 *
 * Emergency broadcasts bypass subscription guard (life-safety over revenue).
 *
 * GET auth surface (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requirePermission('emergency_broadcasts', 'read')
 *     → paginateEmergencyBroadcasts({ communityId, cursor, pageSize })
 *
 * `cursor` and `pageSize` are parsed manually in the handler (NOT in Zod)
 * to preserve empty-string → missing semantics via `||`.
 *
 * POST auth surface:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requirePermission('emergency_broadcasts', 'write')
 *     → createBroadcast (NO requireActiveSubscriptionForMutation)
 *
 * B1-style envelope migration on POST: pre-migration returned flat
 * `NextResponse.json(result)` without `{data}` wrapper. Post-migration the
 * runner wraps into canonical `{ data: result }`. Integration test in
 * `apps/web/__tests__/emergency/emergency-broadcast-routes.test.ts` swept
 * in the same change (drain #76 send precedent).
 *
 * POST validation: body fields validated by contract Zod (400
 * `VALIDATION_ERROR`) instead of pre-migration 422 `UnprocessableEntityError`
 * — status/body shape change only for invalid payloads; success path unchanged
 * at 200.
 *
 * `emergency_broadcasts` IS in `RBAC_RESOURCES`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const emergencyBroadcastsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/emergency-broadcasts',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'emergency_broadcasts', action: 'read' },
});

export const emergencyBroadcastsCreateBodySchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().min(1, 'Title is required').max(500),
  body: z.string().min(1, 'Body is required').max(5000),
  smsBody: z.string().max(1600).optional(),
  severity: z.enum(['emergency', 'urgent', 'info']).default('emergency'),
  templateKey: z.string().optional(),
  targetAudience: z.enum(['all', 'owners_only']).default('all'),
  channels: z
    .array(z.enum(['sms', 'email']))
    .min(1, 'At least one channel required')
    .default(['sms', 'email']),
});

export const emergencyBroadcastsCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/emergency-broadcasts',
  request: {
    body: emergencyBroadcastsCreateBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'emergency_broadcasts', action: 'write' },
});
