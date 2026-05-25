/**
 * GET /api/v1/elections/[id]/my-vote — the calling actor's vote receipt for
 * a given election.
 *
 * Params: { id }. Query: { communityId }. No body.
 *
 * Auth chain (5 gates): requireAuthenticatedUserId → resolveEffectiveCommunityId
 * → requireCommunityMembership → requireElectionsEnabled (SYNC) →
 * requirePermission(membership, 'elections', 'read') →
 * getMyElectionVoteReceiptForCommunity(communityId, electionId, actorUserId).
 *
 * Response modeling: loose z.unknown() — vote receipts carry Date fields
 * (cast/expiry timestamps); tight modeling would risk safeParse failing
 * before NextResponse.json serializes (drain #14/#18 lesson).
 *
 * permission.action must be 'read' — RBAC_ACTIONS only has 'read' | 'write'.
 *
 * Behavior change: pre-migration used `parsePositiveInt(params?.id ?? '',
 * 'election id')` which threw a bespoke error. Zod schema now produces the
 * canonical `VALIDATION_ERROR` envelope for invalid/missing path segment.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const electionsMyVoteGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/elections/[id]/my-vote',
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
    query: z.object({ communityId: z.coerce.number().int().positive() }),
  },
  response: z.unknown(),
  permission: { resource: 'elections', action: 'read' },
});
