/**
 * Route contract for `GET /api/v1/auth/provisioning-status`.
 *
 * Plan A1 drain #152. Post-checkout provisioning poll, for the signed-in
 * founder's own signup only (see route.ts).
 *
 * Response is loose (`z.unknown()`) — branches differ by job status (pending,
 * provisioning, completed with communityId, failed). Consumer unwraps
 * `{ data: payload }` in provisioning-progress.tsx.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const provisioningStatusGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/auth/provisioning-status',
  request: {
    query: z.object({
      signupRequestId: z.string().trim().min(1),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'settings', action: 'read' },
});
