/**
 * Contract for `POST /api/v1/admin/deletion-requests/[id]/intervene`.
 *
 * Plan A1 drain #179. Platform admin cancels a community deletion request.
 *
 * Auth: `requirePlatformAdmin()` only — no `resolveEffectiveCommunityId`.
 *
 * Body `notes` is optional (`z.string().max(2000)`). Pre-migration required
 * JSON parse via `req.json()`; invalid body → `ValidationError` (contract layer).
 *
 * Response: `z.unknown()` — service result may include evolving fields.
 *
 * CORS: applied on the outer `withErrorHandler` wrapper via `mergeAdminCorsHeaders`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const adminDeletionRequestInterveneContract = defineRoute({
  method: 'POST',
  path: '/api/v1/admin/deletion-requests/[id]/intervene',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z
      .object({
        notes: z.string().max(2000).optional(),
      })
      .optional(),
  },
  response: z.unknown(),
});
