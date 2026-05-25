/**
 * Route contract for `GET /api/v1/calendar/events`.
 *
 * Plan A1 bundle drain #35. Query-only GET — no `[id]` path param.
 * `communityId` is OPTIONAL: the pre-migration handler uses
 * `parseCommunityIdFromQueryOrHeader`, which falls back to the
 * `x-community-id` header when the query is absent. We preserve this
 * by accepting `communityId?` and calling `resolveEffectiveCommunityId`
 * with `null` when missing.
 *
 * `start` and `end` are date-string query params consumed by
 * `parseRequiredCalendarDateRange`, which throws BadRequestError for
 * missing/invalid values. We pass these through verbatim (string here;
 * the date-range helper handles validation/parsing).
 *
 * Loose `z.unknown()` response — `events` is an array of objects with
 * `Date`-derived ISO strings and mixed shapes (meeting vs. assessment vs.
 * my-assessment). A tight array element schema would require the
 * discriminated union — loose modeling is the standard for routes
 * where consumer-side TypeScript pins the shape.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const calendarEventsGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/calendar/events',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'meetings', action: 'read' },
});
