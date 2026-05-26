/**
 * E-Sign Submission Cancel API
 *
 * POST /api/v1/esign/submissions/[id]/cancel
 * Body (optional): { communityId? }    — preferred source
 * Query (fallback): ?communityId=N      — used when body omits it
 *
 * Plan A1 drain #72. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and the rationale around the dual
 * `communityId` source + empty-body tolerance.
 *
 * Authorization invariants (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body?.communityId ?? query.communityId ?? null)
 *     → assertNotDemoGrace                 (ASYNC)
 *     → requireCommunityMembership         (ASYNC)
 *     → requireEsignWritePermission        (ASYNC)
 *     → requirePlanFeature(communityId, 'hasEsign')  (ASYNC)
 *     → cancelSubmission(communityId, actorUserId, params.id, requestId)
 *       (with `requestId = req.headers.get('x-request-id')`, forwarded verbatim
 *       including the `null` value when the header is absent)
 *
 * Service arg order: `(communityId, actorUserId, id, requestId)` — actorUserId
 * is the SECOND positional arg.
 *
 * Response shape: `{ data: { success: true } }` — byte-identical to
 * pre-migration.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEsignWritePermission } from '@/lib/esign/esign-route-helpers';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { cancelSubmission } from '@/lib/services/esign-service';
import { esignSubmissionCancelContract } from './contract';

export const POST = withErrorHandler(
  runRoute(esignSubmissionCancelContract, async ({ params, query, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(
      req,
      body?.communityId ?? query.communityId ?? null,
    );
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignWritePermission(membership);
    await requirePlanFeature(communityId, 'hasEsign');

    const requestId = req.headers.get('x-request-id');
    await cancelSubmission(communityId, actorUserId, params.id, requestId);

    return { success: true as const };
  }),
);
