/**
 * Route contract for `POST /api/v1/elections/[id]/vote`.
 *
 * Plan A1 drain #50. Resident-facing vote endpoint — distinct from sibling
 * elections write routes (open/close/cancel/certify/eligibility) in that it
 * has NO `requireElectionsAdminRole` gate. Residents cast votes; admins do
 * not. Closest precedent for the `?? null` body coercion pattern is drain
 * #46 certify (PR #450); auth chain is identical to drains #45-46 minus the
 * admin-role gate.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireElectionsEnabled (sync — NOT awaited)
 *     → requirePermission('elections', 'write')
 *     → castElectionVoteForCommunity(communityId, electionId, actorUserId,
 *         { selectedCandidateIds, isAbstention, proxyId, unitId },
 *         x-request-id)
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. `parsePositiveInt('election id')` is now expressed
 * via Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Body has FOUR optional fields:
 *   - `selectedCandidateIds`: array of positive ints, max 25 entries
 *   - `isAbstention`: boolean
 *   - `proxyId`: positive int, nullable + optional
 *   - `unitId`: positive int, nullable + optional
 *
 * The `?? null` coercion on `proxyId` and `unitId` is preserved verbatim in
 * the handler — the service expects `null` (not `undefined`) for those two
 * fields. `selectedCandidateIds` and `isAbstention` pass through unchanged
 * (the service handles `undefined`).
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `castElectionVoteForCommunity` returns a service value that may carry
 * `Date` fields; a tight `z.object({...})` schema would `safeParse`-fail
 * against real Date instances before `NextResponse.json` ISO-serializes
 * them (drain #14/#18/#20/#32/#42/#46 precedent).
 *
 * `permission: { resource: 'elections', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'elections', 'write')` call.
 * `elections` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid election vote payload')`)
 * shifts to the canonical `VALIDATION_ERROR` envelope. Status code
 * unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const electionsVoteContract = defineRoute({
  method: 'POST',
  path: '/api/v1/elections/[id]/vote',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
      selectedCandidateIds: z.array(z.number().int().positive()).max(25).optional(),
      isAbstention: z.boolean().optional(),
      proxyId: z.number().int().positive().nullable().optional(),
      unitId: z.number().int().positive().nullable().optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'elections', action: 'write' },
});
