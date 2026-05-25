/**
 * Route contract for `GET /api/v1/elections/[id]`.
 *
 * Plan A1 bundle drain #32 (one of seven detail-getter GETs migrated to
 * `runRoute(contract, handler)` in a single bundle PR — sibling routes
 * #33 amenities/[id]/schedule, #34 assessments/[id]/line-items,
 * #35 calendar/events, #36 documents/drafts/[id]/document-search,
 * #37 meetings/[id], #38 documents/[id]/versions).
 *
 * Standard params+query GET. Response intentionally typed `z.unknown()`
 * (loose) because the service returns an object that includes `Date`
 * fields (e.g. `openAt`, `closeAt`); a tight `z.object({...})` schema
 * would `safeParse`-fail against real Date instances before
 * `NextResponse.json` ISO-serializes them (drain #14/#18/#20 precedent).
 *
 * `permission: { resource: 'elections', action: 'read' }` matches the
 * runtime `requirePermission(membership, 'elections', 'read')` call.
 * `elections` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` /
 * `communityId` shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status code unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const electionsDetailGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/elections/[id]',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'elections', action: 'read' },
});
