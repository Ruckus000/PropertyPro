/**
 * Contract for `POST /api/v1/admin/deletion-requests/[id]/recover`.
 *
 * Plan A1 drain. Platform admin recovers a soft-deleted user or community.
 * The handler reads `request_type` from the deletion request to dispatch to
 * the correct recovery function (`recoverUser` vs `recoverCommunity`).
 *
 * Auth: `requirePlatformAdmin()` only — no `resolveEffectiveCommunityId`,
 * no community membership.
 *
 * Request: no body. `params.id` is `z.coerce.number().int().positive()` —
 * pre-migration used `Number(id)` then rejected `NaN`/`<= 0` with a
 * `ValidationError`; the contract layer now does the equivalent 400.
 *
 * Response: `z.unknown()` — both `recoverUser` and `recoverCommunity` return
 * the Drizzle deletion-request row (via `.returning()`), which contains
 * `Date` fields that would fail a tight schema's `safeParse`.
 *
 * CORS: applied on the outer `withErrorHandler` wrapper via
 * `mergeAdminCorsHeaders`; OPTIONS re-exported from `admin-cors`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const adminDeletionRequestRecoverContract = defineRoute({
  method: 'POST',
  path: '/api/v1/admin/deletion-requests/[id]/recover',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
});
