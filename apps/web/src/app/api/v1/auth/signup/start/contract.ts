/**
 * Route contract for `POST /api/v1/auth/signup/start` — email-first signup,
 * step 1. Public: the caller has no session yet. Field validation stays in
 * `startEmailFirstSignup` (one validation layer, as for `POST /auth/signup`).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const authSignupStartPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/auth/signup/start',
  request: {
    body: z.unknown(),
  },
  response: z.object({
    message: z.string(),
  }),
  permission: { resource: 'settings', action: 'write' },
});
