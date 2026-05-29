/**
 * Route contract for `POST /api/v1/auth/confirm-verification`.
 *
 * Plan A1 drain #157. Token-authenticated (no session) — advances a
 * pending_signups row to `email_verified` after Supabase confirms email.
 * Idempotent success when status is already `email_verified` or
 * `checkout_started`.
 *
 * `permission: { resource: 'settings', action: 'read' }` is a placeholder;
 * auth is the unguessable signupRequestId UUID (same as drain #154).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const confirmVerificationPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/auth/confirm-verification',
  request: {
    body: z.object({
      signupRequestId: z.string().min(1).max(128).trim(),
    }),
  },
  response: z.object({
    success: z.literal(true),
    signupRequestId: z.string(),
  }),
  permission: { resource: 'settings', action: 'read' },
});
