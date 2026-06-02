/**
 * Route contracts for `GET` and `POST /api/v1/auth/signup`.
 *
 * Plan A1 drain #166. Public signup subdomain check + signup submission.
 *
 * GET query uses `signupSubdomainSchema` from the shared signup module.
 * POST body is `z.unknown()` — field validation stays in `submitSignup`
 * (single validation layer; complex superRefine logic preserved in service).
 *
 * No session auth on either method (public signup flow).
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

export const authSignupPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/auth/signup',
  request: {
    body: z.unknown(),
  },
  response: z.object({
    signupRequestId: z.string(),
    subdomain: z.string(),
    verificationRequired: z.literal(true),
    checkoutEligible: z.literal(false),
    message: z.string(),
  }),
  permission: { resource: 'settings', action: 'write' },
});
