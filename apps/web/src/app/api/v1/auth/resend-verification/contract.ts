/**
 * Route contract for `POST /api/v1/auth/resend-verification`.
 *
 * Plan A1 drain #154. Re-sends signup verification email (no session auth —
 * secured by unguessable signupRequestId UUID).
 *
 * Success response is canonical `{ data: { sent, cooldownSeconds } }`. Two
 * non-standard wire shapes are preserved via route-level error dispatch:
 *   - 409 + `{ data: { alreadyVerified, signupRequestId } }` (redirect to checkout)
 *   - 429 + `{ error: { message, cooldownRemainingSeconds } }` (no `code` field)
 *
 * Other failures use thrown `AppError` / `NotFoundError` (consumer reads
 * `error.message` only).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const resendVerificationPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/auth/resend-verification',
  request: {
    body: z.object({
      signupRequestId: z.string().min(1, 'signupRequestId is required').max(128).trim(),
    }),
  },
  response: z.object({
    sent: z.literal(true),
    cooldownSeconds: z.number(),
  }),
  permission: { resource: 'settings', action: 'read' },
});
