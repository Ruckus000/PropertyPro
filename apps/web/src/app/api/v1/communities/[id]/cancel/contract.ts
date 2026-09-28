/**
 * Route contract for `POST /api/v1/communities/[id]/cancel`.
 *
 * Plan A1 drain #155. Cancels Stripe subscription, soft-deletes community,
 * recalculates billing-group volume tier. Mirrors drain #18 cancel-preview
 * billing-group ownership auth model with a POST body (reason + optional note).
 *
 * `permission: { resource: 'communities', action: 'write' }` documents intent;
 * the runner does not enforce it — the real gate is billing-group ownership
 * plus a current property_manager/root_manager role in the community (F6).
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { cancellationReasonSchema } from '@propertypro/shared';

export const communityCancelPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/communities/[id]/cancel',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      reason: cancellationReasonSchema,
      note: z.string().max(2000).optional(),
    }),
  },
  response: z.object({
    canceled: z.literal(true),
    communityId: z.number().int().positive(),
  }),
  permission: { resource: 'communities', action: 'write' },
  // Nested resource: the `[id]` path segment is the authoritative tenant id
  // (no header cross-check) — the package runner reads it directly, so this
  // route keeps importing `runRoute` from `@propertypro/api-contract`.
  tenantScope: { in: 'path', field: 'id' },
});
