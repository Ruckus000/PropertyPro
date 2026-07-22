/**
 * Route contracts for snowbird digest self-service preferences.
 *
 * GET returns the caller's effective cadence + whether the board enabled it.
 * PATCH sets the caller's own cadence (self-service — the handler forces the
 * row to the authenticated user; a target user id is never accepted).
 * PATCH .../community toggles the board's per-community enable flag (admin).
 *
 * tenantScope declared → import runRoute from `@/lib/api/run-route`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const snowbirdCadenceValues = ['weekly', 'monthly', 'off'] as const;

export const snowbirdGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/snowbird-digest/subscription',
  request: { query: z.object({ communityId: z.coerce.number().int().positive() }) },
  response: z.unknown(),
  permission: { resource: 'settings', action: 'read' },
  tenantScope: { in: 'query' },
});

export const snowbirdPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/snowbird-digest/subscription',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      cadence: z.enum(snowbirdCadenceValues),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'settings', action: 'read' },
  tenantScope: { in: 'body' },
});

export const snowbirdCommunityToggleContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/snowbird-digest/community',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      enabled: z.boolean(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'settings', action: 'write' },
  tenantScope: { in: 'body' },
});
