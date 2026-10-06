/**
 * Route contract for `POST /api/v1/auth/signup/details` — email-first signup,
 * step 3. Session-authenticated: the emailed link signed the caller in. Field
 * validation stays in `submitSignupDetails`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const authSignupDetailsPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/auth/signup/details',
  request: {
    body: z.unknown(),
  },
  response: z.object({
    signupRequestId: z.string(),
    subdomain: z.string(),
  }),
  permission: { resource: 'settings', action: 'write' },
});
