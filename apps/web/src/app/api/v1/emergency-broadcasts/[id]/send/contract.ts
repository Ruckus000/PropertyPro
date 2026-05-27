/**
 * Route contract for `POST /api/v1/emergency-broadcasts/[id]/send`.
 *
 * Plan A1 drain #76. Executes a previously-created emergency broadcast.
 * Service is `executeBroadcast(broadcastId, communityId, userId)` — note
 * `broadcastId` is the FIRST positional arg (matches drain #71 cancel pattern).
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requirePermission('emergency_broadcasts', 'write')
 *     → executeBroadcast(broadcastId, communityId, userId)
 *
 * B1-style envelope migration: pre-migration returned `NextResponse.json(result)`
 * — flat envelope, no `{data}` wrapper. Post-migration the runner wraps the
 * handler return into canonical `{data: <result>}`. Pre-existing integration
 * test in `apps/web/__tests__/emergency/emergency-broadcast-routes.test.ts`
 * is swept in the same change.
 *
 * Response is loosely modeled as `z.unknown()` because `executeBroadcast`
 * may return service rows containing Date fields; tight modeling would
 * `safeParse`-fail before serialization (per drain #9/#14/#18/#20 precedent).
 *
 * `permission: { resource: 'emergency_broadcasts', action: 'write' }` matches
 * the runtime `requirePermission` call. `emergency_broadcasts` IS in
 * `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and
 * missing/non-positive `communityId` shifts from `ValidationError('Invalid
 * broadcast ID')` / `ValidationError('Invalid request')` to the canonical
 * `VALIDATION_ERROR` envelope. Status unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const emergencyBroadcastsSendContract = defineRoute({
  method: 'POST',
  path: '/api/v1/emergency-broadcasts/[id]/send',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'emergency_broadcasts', action: 'write' },
});
