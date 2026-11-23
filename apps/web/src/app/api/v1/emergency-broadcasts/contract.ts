/**
 * Route contracts for `GET` and `POST /api/v1/emergency-broadcasts`.
 *
 * Paginated list + create draft broadcast.
 *
 * Emergency broadcasts bypass subscription guard (life-safety over revenue).
 *
 * GET auth surface:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requirePermission('emergency_broadcasts', 'read')
 *     → paginateEmergencyBroadcasts({ communityId, cursor, pageSize,
 *         recipientUserId: non-managers only })
 *
 * Managers page over every broadcast row. Everyone else pages over the
 * broadcasts sent to them, as `{ id, title, body, severity, completedAt }`.
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
 * POST returns `{ data: result }`; invalid bodies are 400 `VALIDATION_ERROR`.
 *
 * POST with `scheduledFor` (ISO 8601 with an offset or `Z`) SCHEDULES the
 * broadcast instead of drafting it: no recipient rows are written, the
 * scheduled-emergency-broadcasts cron sends it, and the result also carries
 * `scheduledFor`. The time must be 5 minutes to 365 days ahead, enforced in
 * `createBroadcast` (400 `VALIDATION_ERROR`, field `scheduledFor`). Without
 * `scheduledFor` the route behaves exactly as before.
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
  scheduledFor: z.string().datetime({ offset: true }).optional(),
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
