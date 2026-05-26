/**
 * Route contract for `POST /api/v1/emergency-broadcasts/[id]/cancel`.
 *
 * Plan A1 drain #71. Cancels a recently-sent emergency broadcast within the
 * 10-second undo window. Service is `cancelBroadcast(broadcastId, communityId,
 * userId)` — note `broadcastId` is the FIRST positional arg (NOT communityId-
 * first as on most sibling services).
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requirePermission('emergency_broadcasts', 'write')
 *     → cancelBroadcast(broadcastId, communityId, userId)
 *
 * Behavior changes vs. pre-migration (both intentional B1 Slice 5 normalizations):
 *   1. The inline `NextResponse.json({ error: 'Undo window has expired...' },
 *      { status: 409 })` for the expired-window branch is replaced with
 *      `throw new ConflictError('Undo window has expired. Broadcast cannot be
 *      canceled.')`. Status remains 409. The error message string is preserved
 *      byte-identical, but the wire envelope shifts from flat `{error}` to
 *      canonical `{error: {code: 'CONFLICT', message: ...}}`.
 *   2. The non-canonical top-level success envelope `{canceled: true}` becomes
 *      `{data: {canceled: true}}` once the runner wraps the handler return.
 *
 * Response is tightly modeled as `z.object({ canceled: z.literal(true) })`
 * because the shape is small, known, and contains no Date fields — `safeParse`
 * against `{canceled: true as const}` succeeds. The handler returns `true as
 * const` to satisfy the literal.
 *
 * `permission: { resource: 'emergency_broadcasts', action: 'write' }` matches
 * the runtime `requirePermission` call. `emergency_broadcasts` IS in
 * `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and missing/
 * non-positive `communityId` shifts from `ValidationError('Invalid broadcast
 * ID')` / `ValidationError('Invalid request')` to the canonical
 * `VALIDATION_ERROR` envelope. Status unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const emergencyBroadcastsCancelContract = defineRoute({
  method: 'POST',
  path: '/api/v1/emergency-broadcasts/[id]/cancel',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
    }),
  },
  response: z.object({
    canceled: z.literal(true),
  }),
  permission: { resource: 'emergency_broadcasts', action: 'write' },
});
