/**
 * POST /api/v1/admin/join-requests/[id]/deny
 *
 * Plan A1 drain #83. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schema and rationale.
 *
 * Mirrors drain #81 (approve sibling) exactly — only differences are the
 * service call (`denyJoinRequest`) and audit action (`join_request.denied`).
 *
 * Header-only communityId source preserved (`resolveEffectiveCommunityId(req, null)`)
 * — there is no body.communityId field on this endpoint.
 *
 * Empty-body tolerance preserved via fully-optional body schema (mirrors
 * drain #72 esign/cancel and drain #81 approve). Handler reads `body?.notes`
 * defensively.
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
 *     → denyJoinRequest({ requestId, reviewerUserId, notes })
 *     → logAuditEvent({ action: 'join_request.denied', ... })
 *
 * Audit log preserved post-service-call (drain #73 precedent). Metadata
 * `{ notes: body?.notes ?? null }` keeps persisted shape byte-identical.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { NotFoundError, ForbiddenError } from '@/lib/api/errors';
import {
  denyJoinRequest,
  getJoinRequestCommunityId,
} from '@/lib/join-requests/approve-request';
import { logAuditEvent } from '@propertypro/db';
import { adminJoinRequestDenyContract } from './contract';

export const POST = withErrorHandler(
  runRoute(adminJoinRequestDenyContract, async ({ params, body, req }) => {
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

    const result = await denyJoinRequest({
      requestId: params.id,
      reviewerUserId: userId,
      notes: body?.notes,
    });

    await logAuditEvent({
      userId,
      communityId,
      action: 'join_request.denied',
      resourceType: 'community_join_request',
      resourceId: String(params.id),
      metadata: { notes: body?.notes ?? null },
    });

    return result;
  }),
);
