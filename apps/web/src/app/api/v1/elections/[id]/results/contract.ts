/**
 * GET /api/v1/elections/[id]/results — aggregate results for an election.
 *
 * Params: { id }. Query: { communityId }. No body.
 *
 * Auth chain (5 gates): requireAuthenticatedUserId → resolveEffectiveCommunityId
 * → requireCommunityMembership → requireElectionsEnabled (SYNC) →
 * requirePermission(membership, 'elections', 'read') →
 * getElectionResultsForCommunity(communityId, electionId).
 *
 * Response modeling: loose z.unknown() — election results may include Date
 * fields (certification/closure timestamps) and could evolve.
 *
 * permission.action must be 'read' — RBAC_ACTIONS only has 'read' | 'write'.
 *
 * Mirrors drain #30 (sibling /my-vote route) — same params + query + auth
 * chain. Difference: service call signature `(communityId, electionId)`
 * (no actor user) and `requireElectionsEnabled` likewise sync.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const electionsResultsGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/elections/[id]/results',
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
    query: z.object({ communityId: z.coerce.number().int().positive() }),
  },
  response: z.unknown(),
  permission: { resource: 'elections', action: 'read' },
});
