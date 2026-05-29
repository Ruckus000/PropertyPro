/**
 * Route contract for `GET /api/v1/transparency` (public transparency page).
 *
 * Plan A1 drain #141. Slug-based lookup via unscoped query; no session auth.
 * Response is loose (`z.unknown()`) — service payload may evolve additively.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const transparencyPublicGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/transparency',
  request: {
    query: z.object({
      slug: z
        .string()
        .trim()
        .min(1)
        .regex(/^[a-z0-9-]+$/),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'communities', action: 'read' },
});
