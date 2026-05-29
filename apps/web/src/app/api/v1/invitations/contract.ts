/**
 * Route contracts for `POST` and `PATCH /api/v1/invitations`.
 *
 * Plan A1 drain #130. Create invitation (email) + accept via token.
 *
 * POST auth: requireAuthenticatedUserId → resolveEffectiveCommunityId →
 *   assertNotDemoGrace → requireCommunityMembership → service + email.
 *
 * PATCH is token-authenticated (no session user). Preserves TOKEN_USED /
 * TOKEN_EXPIRED as `AppError` 400 responses (consumer reads `error.code`).
 */
import { defineRoute, z } from '@propertypro/api-contract';

const createInvitationBodySchema = z.object({
  communityId: z.number().int().positive(),
  userId: z.string().min(1),
  ttlDays: z.number().int().min(0).max(30).optional(),
});

const acceptInvitationBodySchema = z.object({
  communityId: z.number().int().positive(),
  token: z.string().min(1),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain a special character'),
});

export const createInvitationContract = defineRoute({
  method: 'POST',
  path: '/api/v1/invitations',
  request: {
    body: createInvitationBodySchema,
  },
  response: z.object({ success: z.literal(true) }),
  permission: { resource: 'settings', action: 'write' },
});

export const acceptInvitationContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/invitations',
  request: {
    body: acceptInvitationBodySchema,
  },
  response: z.object({
    success: z.literal(true),
    email: z.string(),
  }),
  permission: { resource: 'settings', action: 'write' },
});
