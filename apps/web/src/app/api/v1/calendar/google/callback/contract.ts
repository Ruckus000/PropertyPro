/**
 * Route contract for `GET /api/v1/calendar/google/callback`.
 *
 * Plan A1 drain. Google Calendar OAuth callback — exchanges the `code` query
 * parameter for tokens and persists the connection for the calling user.
 * Sibling of the already-drained `connect` (#162), `disconnect` (#89), and
 * `sync` routes in this domain.
 *
 * Auth chain preserved verbatim from the pre-migration handler:
 *   requireAuthenticatedUserId
 *     → parseCommunityIdFromQueryOrHeader(req)                     (resolves
 *         communityId from `?communityId=` query OR the x-community-id header)
 *     → requireCommunityMembership(communityId, actorUserId)        (async)
 *     → requireCalendarSyncEnabledForMembership(membership)         (SYNC)
 *     → requireCalendarSyncWritePermission(membership)              (SYNC)
 *     → validateOAuthState(state, communityId, actorUserId)         (SYNC)
 *     → completeGoogleCalendarConnect(communityId, actorUserId, code, requestId)
 *
 * Tenancy is resolved via `parseCommunityIdFromQueryOrHeader` (query OR
 * header), NOT via a declared `tenantScope` — so no `tenantScope` is declared
 * and the runner does not inject `communityId`. The handler imports `runRoute`
 * from `@propertypro/api-contract` (not the app-bound wrapper).
 *
 * Query params (`state`, `code`) are intentionally NOT declared in the
 * contract and are parsed in the handler instead (corpus rule 7 / rule 11).
 * This preserves byte-identical behavior:
 *   - `validateOAuthState` performs its own state validation + signature
 *     checks (throws BadRequestError/ForbiddenError with bespoke messages).
 *   - The empty/whitespace `code` guard throws
 *     `BadRequestError('code query parameter is required')` — a Zod
 *     `min(1)` declaration would instead produce a `VALIDATION_ERROR`
 *     envelope and would not catch whitespace-only values.
 *
 * Response: TIGHT `z.object({ provider, userId, syncedAt })`. The service
 * `completeGoogleCalendarConnect` has a strict TS return type of
 * `Promise<{ provider: 'google'; userId: string; syncedAt: string | null }>`
 * (see `apps/web/src/lib/services/calendar-sync-service.ts:120-203`) — all
 * fields are already ISO strings / primitives with no Date instances, so
 * tight modeling is safe and preferable here.
 *
 * Permission: `{ resource: 'calendar_sync', action: 'write' }`. The
 * `calendar_sync` resource IS in `RBAC_RESOURCES`
 * (`packages/shared/src/rbac-matrix.ts`); `'write'` matches the runtime gate
 * enforced by `requireCalendarSyncWritePermission`.
 *
 * Success wire shape `{ data: { provider, userId, syncedAt } }` is
 * byte-identical to the pre-migration `NextResponse.json({ data })`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const calendarGoogleCallbackContract = defineRoute({
  method: 'GET',
  path: '/api/v1/calendar/google/callback',
  request: {},
  response: z.object({
    provider: z.literal('google'),
    userId: z.string(),
    syncedAt: z.string().nullable(),
  }),
  permission: { resource: 'calendar_sync', action: 'write' },
});
