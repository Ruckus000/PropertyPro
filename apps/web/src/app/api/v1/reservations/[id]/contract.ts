/**
 * Route contract for `DELETE /api/v1/reservations/[id]`.
 *
 * Plan A1 drain #121. Reservation cancellation via DELETE (query-scoped
 * `communityId`). Sibling action route `POST …/cancel` drained in #70;
 * collection list drained in #102.
 *
 * Auth-first: contract omits `communityId` query so invalid/missing
 * `communityId` does not 400 before `requireAuthenticatedUserId` (forum
 * threads #117 / work-orders detail #119 precedent). `communityId` parsed
 * in-handler via `parseCommunityIdFromQuery` after auth.
 *
 * Mirrors #70 cancel plumbing — async `requirePlanFeature` gate plus
 * role-derived `canCancelAny` threaded into `cancelReservationForCommunity`.
 *
 * Response: loose `z.unknown()` — service row may carry `Date` fields.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const reservationDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/reservations/[id]',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'amenities', action: 'write' },
});
