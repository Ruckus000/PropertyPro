/**
 * Route contract for `GET /api/v1/auth/signup`.
 *
 * Plan A1 drain #166. Public signup subdomain check; the query uses
 * `signupSubdomainSchema` from the shared signup module. No session auth.
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { signupSubdomainSchema } from '@/lib/auth/signup-schema';

export const authSignupGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/auth/signup',
  request: {
    query: signupSubdomainSchema,
  },
  response: z.object({
    normalizedSubdomain: z.string(),
    available: z.boolean(),
    reason: z.enum(['invalid', 'reserved', 'taken', 'available', 'unknown']),
    message: z.string(),
  }),
  permission: { resource: 'settings', action: 'read' },
});
