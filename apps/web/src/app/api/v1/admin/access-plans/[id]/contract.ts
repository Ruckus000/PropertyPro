/**
 * Contract for `DELETE /api/v1/admin/access-plans/[id]`.
 *
 * Plan A1 drain. Platform admin revokes a free-access plan.
 *
 * Auth: `requirePlatformAdmin()` only — no `resolveEffectiveCommunityId`.
 *
 * `params.id` is the access-plan ID (positive integer). Pre-migration used
 * `Number(id)` + `ValidationError('Invalid plan ID')` for NaN / `<= 0`; the
 * contract uses `z.coerce.number().int().positive()` (standard params
 * validation), so `'abc'` and `'0'` both 400 at the contract layer.
 *
 * Body is optional. Pre-migration tolerated a missing/unparseable body and
 * read an optional `reason` (`z.string().max(1000)`) when present. The contract
 * declares `body` as `.optional()` with the same `reason` shape; the runner
 * parses it when present and the handler forwards `body?.reason` (already
 * `string | undefined`, matching `RevokeFreeAccessParams.reason`).
 *
 * Response: `z.unknown()` — `revokeFreeAccess` returns the updated Drizzle row
 * (carries `Date` fields like `revokedAt` / `createdAt`), so a tight schema
 * would safeParse-fail.
 *
 * CORS: applied on the outer `withErrorHandler` wrapper via `mergeAdminCorsHeaders`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const adminAccessPlanRevokeContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/admin/access-plans/[id]',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z
      .object({
        reason: z.string().max(1000).optional(),
      })
      .optional(),
  },
  response: z.unknown(),
});
