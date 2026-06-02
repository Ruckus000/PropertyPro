/**
 * Contract for `GET /api/v1/admin/deletion-requests`.
 *
 * Plan A1 drain #175. Platform-admin list of account deletion requests.
 *
 * Auth: `requirePlatformAdmin()` only — no `resolveEffectiveCommunityId`.
 *
 * Optional `status` and `type` query filters stay **out of contract** (tri-state
 * manual parse in the handler) to preserve the pre-migration
 * `ValidationError` field messages for invalid enum values.
 *
 * Response: `z.array(z.unknown())` — rows may include `Date` fields and evolve
 * additively (drain #172 / #14 precedent).
 *
 * CORS: applied on the outer `withErrorHandler` wrapper via `mergeAdminCorsHeaders`
 * (admin app cross-origin).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const adminDeletionRequestsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/admin/deletion-requests',
  request: {},
  response: z.array(z.unknown()),
});
