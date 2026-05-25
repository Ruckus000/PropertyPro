/**
 * Contract for POST /api/v1/elections/[id]/eligibility.
 *
 * Plan A1 drain #44. Admin endpoint to take a manual eligibility snapshot for
 * an election. Mechanically identical to sibling drains #42 (open) and #43
 * (close) — same body schema, same 7-gate auth chain; differs only in the
 * service function (`snapshotElectionEligibilityForCommunity`).
 *
 * Auth chain (unchanged from pre-migration, enforced inside the handler):
 *   requireAuthenticatedUserId → resolveEffectiveCommunityId(req, body.communityId)
 *   → assertNotDemoGrace → requireCommunityMembership
 *   → requireElectionsEnabled → requirePermission('elections', 'write')
 *   → requireElectionsAdminRole → snapshotElectionEligibilityForCommunity.
 *
 * Body schema matches the pre-migration `snapshotEligibilitySchema`
 * byte-for-byte: `{ communityId: number }` (positive int). Because the
 * schema enforces positivity, the runtime `parseCommunityIdFromBody`
 * positive-int guard becomes redundant and collapses to a plain
 * `resolveEffectiveCommunityId(req, body.communityId)` call in the handler.
 *
 * Response modeling: loose `z.unknown()`. `snapshotElectionEligibilityForCommunity`
 * returns `{ electionId, eligibleUnitCount, insertedCount, snapshotTakenAt }`
 * today, but a tight schema would break forward-compat if the service later
 * adds fields, and matches the loose convention used by sibling POST drains.
 *
 * `permission: { resource: 'elections', action: 'write' }` mirrors the
 * inline `requirePermission(membership, 'elections', 'write')` call.
 *
 * Behavior change vs. pre-migration:
 *   - Invalid `params.id` (non-numeric, zero, negative) and invalid body
 *     (e.g., `communityId: 0` or missing) now return the runner's canonical
 *     `VALIDATION_ERROR` envelope instead of bespoke
 *     `ValidationError('Invalid election eligibility payload')` /
 *     `parsePositiveInt('election id')` throws. Status code 400 unchanged.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const electionsEligibilityContract = defineRoute({
  method: 'POST',
  path: '/api/v1/elections/[id]/eligibility',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'elections', action: 'write' },
});
