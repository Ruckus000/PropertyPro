/**
 * Route contract for `/api/v1/community/unit-count` (v4 builder, Phase 2b).
 *
 * How many units (condo) or parcels (HOA) the association has —
 * `communities.unit_count` (migration 0080). It decides whether Florida's
 * website rules apply: §718.111(12)(g) reaches condos of 25+ units, §720.303
 * HOAs of 100+ parcels (`requirementLevel` in @propertypro/shared). The site
 * builder asks for it when it is unknown and lets an admin correct it.
 *
 * PATCH only: the editor already receives the value server-side, so there is
 * no client read to serve. Admin-only, like the contact details next door.
 *
 * Bounds match the column's CHECK (`communities_unit_count_range`) and stay
 * above the signup form's 20,000 cap. A count cannot be CLEARED back to
 * unknown: unknown exists only for rows that predate the column, and letting
 * an admin restore it would be a way to make the requirement "might apply"
 * forever rather than answering the question.
 *
 * `permission` is metadata only; the handler checks `membership.isAdmin`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const UNIT_COUNT_MIN = 1;
export const UNIT_COUNT_MAX = 100_000;

export const patchCommunityUnitCountContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/community/unit-count',
  request: {
    body: z
      .object({
        communityId: z.number().int().positive(),
        unitCount: z.number().int().min(UNIT_COUNT_MIN).max(UNIT_COUNT_MAX),
      })
      .strict(),
  },
  response: z.object({ unitCount: z.number().int() }),
  permission: { resource: 'settings', action: 'write' },
  // The app-bound runner reconciles `body.communityId` with the middleware
  // `x-community-id` header (header authoritative) and injects it.
  tenantScope: { in: 'body' },
});
