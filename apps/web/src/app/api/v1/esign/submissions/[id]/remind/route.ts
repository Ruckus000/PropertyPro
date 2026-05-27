/**
 * E-Sign Submission Remind API
 *
 * POST /api/v1/esign/submissions/[id]/remind
 * Body: { communityId, signerId }
 *
 * Plan A1 drain #82. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema rationale.
 *
 * Authorization invariants (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace                 (ASYNC)
 *     → requireCommunityMembership         (ASYNC)
 *     → requireEsignWritePermission        (ASYNC)
 *     → requirePlanFeature(communityId, 'hasEsign')  (ASYNC)
 *     → sendReminder(communityId, actorUserId, params.id, body.signerId, requestId)
 *       (with `requestId = req.headers.get('x-request-id')`, forwarded verbatim
 *       including the `null` value when the header is absent)
 *
 * Service arg order: `(communityId, actorUserId, id, signerId, requestId)` —
 * actorUserId is the SECOND positional arg.
 *
 * Response shape: `{ data: { success: true } }` — byte-identical to pre-migration.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEsignWritePermission } from '@/lib/esign/esign-route-helpers';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { sendReminder } from '@/lib/services/esign-service';
import { esignSubmissionRemindContract } from './contract';

export const POST = withErrorHandler(
  runRoute(esignSubmissionRemindContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignWritePermission(membership);
    await requirePlanFeature(communityId, 'hasEsign');

    const requestId = req.headers.get('x-request-id');
    await sendReminder(communityId, actorUserId, params.id, body.signerId, requestId);

    return { success: true as const };
  }),
);
