/**
 * Route contract for `GET /api/v1/auth/provisioning-status`.
 *
 * Plan A1 drain #152. Post-checkout provisioning poll (no session auth — secured
 * by unguessable signupRequestId UUID).
 *
 * Response is loose (`z.unknown()`) — branches differ by job status (pending,
 * provisioning, completed with optional loginToken, failed). Consumer unwraps
 * `{ data: payload }` after B1 migration in provisioning-progress.tsx.
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
