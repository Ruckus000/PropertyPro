/**
 * Route contracts for `/api/v1/settings/support-access` — GET, POST.
 *
 * Plan A1 drain #147. Community consent toggle for platform support access.
 *
 * GET: `resolveEffectiveCommunityId(req, query.communityId)` after auth.
 * POST: same on `body.communityId`.
 *
 * Response schemas are loose — Supabase rows may carry timestamps and metadata.
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { ConsentToggleSchema } from '@propertypro/shared';

export const supportAccessGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/settings/support-access',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.object({
    consentActive: z.boolean(),
    consent: z.unknown().nullable(),
    recentAccess: z.array(z.unknown()),
  }),
  permission: { resource: 'settings', action: 'read' },
});

export const supportAccessPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/settings/support-access',
  request: {
    body: ConsentToggleSchema,
  },
  response: z.object({
    ok: z.literal(true),
  }),
  permission: { resource: 'settings', action: 'write' },
});
