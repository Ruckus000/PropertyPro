/**
 * Route contract for `GET /api/v1/search/units`.
 *
 * Plan A1 drain #161. Staff unit label search (combobox backing).
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requireStaffOperator
 *     → searchUnitsByLabel
 *
 * Envelope migration: flat `{ results }` → `{ data: { results } }`.
 * Consumer `use-unit-search` unwraps `.data.results` in the same PR.
 *
 * `limit` default/clamp stays in-handler (`?? 10`, clamp 1–20) to match
 * pre-migration `Number()` fallback for non-finite values.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const unitSearchResultSchema = z.object({
  id: z.number(),
  label: z.string(),
  building: z.string().nullable(),
  floor: z.number().nullable(),
});

export const searchUnitsContract = defineRoute({
  method: 'GET',
  path: '/api/v1/search/units',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      q: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(20).optional(),
    }),
  },
  response: z.object({
    results: z.array(unitSearchResultSchema),
  }),
  permission: { resource: 'settings', action: 'read' },
});
