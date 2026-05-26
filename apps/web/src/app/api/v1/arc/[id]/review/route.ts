/**
 * ARC — record reviewer notes on a submission (admin/reviewer-facing).
 *
 * PATCH /api/v1/arc/[id]/review
 * Body: { communityId, reviewNotes? }
 *
 * Plan A1 drain #64. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Auth chain preserved
 * verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireArcEnabled (ASYNC — awaited)
 *     → requirePermission('arc_submissions', 'read')
 *     → requirePermission('arc_submissions', 'write')
 *     → requireArcReviewPermission (sync, NOT awaited)
 *     → reviewArcSubmissionForCommunity(communityId, id, actorUserId,
 *         { reviewNotes }, x-request-id)
 *
 * The `?? null` coercion on `reviewNotes` is preserved verbatim — the
 * service expects `null` (not `undefined`) for this field (drain #46/#51
 * precedent).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status unchanged. Success wire shape `{ data: ... }` byte-identical.
 *
 * `x-request-id` header forwarded verbatim to `reviewArcSubmissionForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireArcEnabled, requireArcReviewPermission } from '@/lib/violations/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { reviewArcSubmissionForCommunity } from '@/lib/services/violations-service';
import { requirePermission } from '@/lib/db/access-control';
import { arcReviewContract } from './contract';

export const PATCH = withErrorHandler(
  runRoute(arcReviewContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireArcEnabled(membership);
    requirePermission(membership, 'arc_submissions', 'read');
    requirePermission(membership, 'arc_submissions', 'write');
    requireArcReviewPermission(membership);

    return reviewArcSubmissionForCommunity(
      communityId,
      params.id,
      actorUserId,
      {
        reviewNotes: body.reviewNotes ?? null,
      },
      req.headers.get('x-request-id'),
    );
  }),
);
