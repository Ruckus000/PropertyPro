/**
 * Route contract for `POST /api/v1/reauth/verify`.
 *
 * Plan A1 drain #171. Verifies the user's password and mints a short-lived
 * pp-reauth cookie (applied on the outer response after `runRoute`).
 *
 * Session-anchored: no tenant context. Response `{ ok: true }` is
 * single-wrapped by the runner as `{ data: { ok: true } }` — already
 * canonical after B1 Slice 1; hook only reads errors on failure.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const reauthVerifyPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/reauth/verify',
  request: {
    body: z.object({
      password: z.string().min(1, 'Password is required'),
    }),
  },
  response: z.object({
    ok: z.literal(true),
  }),
  permission: { resource: 'settings', action: 'read' },
});
