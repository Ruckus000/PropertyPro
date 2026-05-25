/**
 * GET /api/v1/esign/my-pending — list pending e-sign requests for the
 * authenticated user.
 *
 * Query: { communityId }. No body.
 *
 * Auth chain: requireAuthenticatedUserId → resolveEffectiveCommunityId
 * (via parseCommunityIdFromQuery) → requireCommunityMembership →
 * requireEsignReadPermission → listMyPendingForActor.
 *
 * Response modeling: loose z.array(z.unknown()) — the service returns esign
 * submission rows whose internal shape (envelope/payload metadata, Date
 * fields like `createdAt`/`updatedAt`) may evolve. The runner's safeParse
 * runs BEFORE NextResponse.json serializes (drain #9/#14 lesson), so Date
 * values would fail z.string() schemas. No UI consumer in the repo today;
 * forward-compat preserved via loose modeling.
 *
 * Note: pre-migration used parseCommunityIdFromQuery which already
 * delegates to resolveEffectiveCommunityId (drain #10 lesson). The
 * x-community-id header / query mismatch → 404 behavior is preserved
 * verbatim — no behavior change.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const esignMyPendingContract = defineRoute({
  method: 'GET',
  path: '/api/v1/esign/my-pending',
  request: {
    query: z.object({ communityId: z.coerce.number().int().positive() }),
  },
  response: z.array(z.unknown()),
  permission: { resource: 'esign', action: 'read' },
});
