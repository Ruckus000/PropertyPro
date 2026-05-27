/**
 * Route contract for `DELETE /api/v1/calendar/google/disconnect`.
 *
 * Plan A1 drain #89. Body-only DELETE in the calendar-sync domain;
 * mirrors drain #84 (`accounting/disconnect`) — second DELETE-with-body
 * in the corpus after that one — but for the Google Calendar provider
 * rather than QuickBooks/Xero.
 *
 * Auth chain preserved verbatim from the pre-migration handler:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace(communityId)
 *     → requireCommunityMembership(communityId, actorUserId)
 *     → requireCalendarSyncEnabledForMembership(membership)       (SYNC)
 *     → requireCalendarSyncWritePermission(membership)            (SYNC)
 *     → disconnectGoogleCalendar(communityId, actorUserId, requestId)
 *
 * The pre-migration handler called `parseCommunityIdFromBody(req, body.communityId)`,
 * which already validated the body shape and delegated to
 * `resolveEffectiveCommunityId` under the hood (drain #10 lesson). The
 * runner now expresses that as Zod body validation plus an explicit
 * `resolveEffectiveCommunityId(req, body.communityId)` call in the
 * handler; net behavior unchanged.
 *
 * Response: TIGHT `z.object({ disconnected: z.boolean() })`. The service
 * `disconnectGoogleCalendar` has a strict TS return type of
 * `Promise<{ disconnected: boolean }>` (see
 * `apps/web/src/lib/services/calendar-sync-service.ts:261-293`) with no
 * Date fields and no extra properties, so tight modeling is safe and
 * preferable here (cf. loose `z.unknown()` in drains #84/#22/#14 where
 * the service returned Date-bearing or polymorphic shapes).
 *
 * Permission: `{ resource: 'calendar_sync', action: 'write' }`. The
 * `calendar_sync` resource IS in `RBAC_RESOURCES` at
 * `packages/shared/src/rbac-matrix.ts:49` (non-placeholder). `'write'`
 * matches the runtime gate enforced by
 * `requireCalendarSyncWritePermission`.
 *
 * Behavior change: pre-migration `ValidationError('Invalid calendar
 * disconnect payload', { fields })` becomes the canonical
 * `VALIDATION_ERROR` envelope produced by the runner; status stays at
 * 400. No consumer reads the literal message string.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const bodySchema = z.object({
  communityId: z.number().int().positive(),
});

export const calendarGoogleDisconnectContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/calendar/google/disconnect',
  request: { body: bodySchema },
  response: z.object({ disconnected: z.boolean() }),
  permission: { resource: 'calendar_sync', action: 'write' },
});
