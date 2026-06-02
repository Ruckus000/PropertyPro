/**
 * Route contract for `POST /api/v1/internal/assessment-overdue`.
 *
 * Plan A1 auto-drain. Daily cron endpoint (06:00 UTC) that transitions
 * pending assessment line items with `due_date < today` to `overdue` across
 * all non-deleted communities.
 *
 * This is a CRON-authenticated route, NOT a community-membership route. The
 * auth surface is preserved verbatim from the pre-migration handler:
 *   requireCronSecret(req, process.env.ASSESSMENT_CRON_SECRET)
 *     → processOverdueTransitions()
 *
 * `requireCronSecret` validates a Bearer token with a timing-safe comparison
 * and throws `UnauthorizedError` (401) when the token is missing or wrong.
 * There is no RBAC resource/action involved, so the contract intentionally
 * omits the optional `permission` metadata field.
 *
 * Request: no params, no query, no body. The handler still receives `req` so
 * it can read the Authorization header for the cron-secret check.
 *
 * Response model: TIGHT `z.object({...})`. `processOverdueTransitions` returns
 * a synthesized `OverdueTransitionSummary` (`{ communitiesScanned,
 * itemsTransitioned, errors }`) — three plain numbers, NO `Date` fields — so a
 * tight schema is safe (it would not safeParse-fail the way Drizzle-row shapes
 * with Date columns do). Fields mirror the service's TS return type exactly;
 * no invented fields.
 *
 * Wire shape `{ data: summary }` is byte-identical to the pre-migration
 * `NextResponse.json({ data: summary })`. No consumer changes required.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const assessmentOverdueContract = defineRoute({
  method: 'POST',
  path: '/api/v1/internal/assessment-overdue',
  request: {},
  response: z.object({
    communitiesScanned: z.number(),
    itemsTransitioned: z.number(),
    errors: z.number(),
  }),
});
