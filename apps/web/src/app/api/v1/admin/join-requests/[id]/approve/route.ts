/**
 * POST /api/v1/admin/join-requests/[id]/approve
 *
 * Plan A1 drain #81. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schema and rationale.
 *
 * Header-only communityId source preserved (`resolveEffectiveCommunityId(req, null)`)
 * — there is no body.communityId field on this endpoint.
 *
 * Empty-body tolerance preserved via fully-optional body schema (mirrors
 * drain #72 esign/cancel). Handler reads `body?.notes` defensively.
 *
 * Auth chain (preserved verbatim from pre-migration):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, null)            // header-only
 *     → requireCommunityMembership                        (ASYNC)
 *     → requirePermission(membership, 'residents', 'write')
 *     → getJoinRequestCommunityId(params.id)
 *     → 404 NotFoundError('Join request not found')       when null
 *     → 403 ForbiddenError('Request belongs to a different community')
 *                                                         when mismatched
 *     → approveJoinRequest({ requestId, reviewerUserId, notes })
 *     → logAuditEvent({ action: 'join_request.approved', ... })
 *
 * Audit log written post-service-call (drain #73 precedent). Metadata is
 * `{ notes, requestedResidentType, grantedResidentType }`: the pair differs
 * when an apartment owner request is approved as a tenant.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { NotFoundError, ForbiddenError } from '@/lib/api/errors';
import {
  approveJoinRequest,
  getJoinRequestCommunityId,
} from '@/lib/join-requests/approve-request';
import { logAuditEvent } from '@propertypro/db';
import { adminJoinRequestApproveContract } from './contract';

export const POST = withErrorHandler(
  runRoute(adminJoinRequestApproveContract, async ({ params, body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, null);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'residents', 'write');

    const requestCommunityId = await getJoinRequestCommunityId(params.id);
    if (requestCommunityId === null) {
      throw new NotFoundError('Join request not found');
    }
    if (requestCommunityId !== communityId) {
      throw new ForbiddenError('Request belongs to a different community');
    }

    const { requestedResidentType, grantedResidentType, ...result } = await approveJoinRequest({
      requestId: params.id,
      reviewerUserId: userId,
      notes: body?.notes,
    });

    // The requested/granted pair records an apartment owner request approved
    // as a tenant; the response body is unchanged.
    await logAuditEvent({
      userId,
      communityId,
      action: 'join_request.approved',
      resourceType: 'community_join_request',
      resourceId: String(params.id),
      metadata: { notes: body?.notes ?? null, requestedResidentType, grantedResidentType },
    });

    return result;
  }),
);
