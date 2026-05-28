/**
 * Violation detail API — get and update a violation.
 *
 * GET  /api/v1/violations/[id]
 * PATCH /api/v1/violations/[id]
 *
 * Plan A1 drain #120 — migrated to `runRoute(contract, handler)`;
 * see `./contract.ts` for schemas and auth-chain rationale.
 */
import { runRoute } from '@propertypro/api-contract';
import { createScopedClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  getActorUnitIds,
  isResidentRole,
  requireViolationAdminWrite,
  requireViolationsEnabled,
} from '@/lib/violations/common';
import { getViolationForCommunity, updateViolationForCommunity } from '@/lib/services/violations-service';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';
import { requirePermission } from '@/lib/db/access-control';
import {
  violationDetailGetContract,
  violationUpdateContract,
} from './contract';

export const GET = withErrorHandler(
  runRoute(violationDetailGetContract, async ({ params, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireViolationsEnabled(membership);
    requirePermission(membership, 'violations', 'read');

    const scoped = createScopedClient(communityId);
    const residentUnitIds = isResidentRole(membership.role)
      ? await getActorUnitIds(scoped, actorUserId)
      : undefined;

    return getViolationForCommunity(communityId, params.id, residentUnitIds);
  }),
);

export const PATCH = withErrorHandler(
  runRoute(violationUpdateContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req, body.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireViolationsEnabled(membership);
    requirePermission(membership, 'violations', 'write');
    requireViolationAdminWrite(membership);

    const requestId = req.headers.get('x-request-id');
    return updateViolationForCommunity(
      communityId,
      params.id,
      actorUserId,
      {
        category: body.category,
        description: body.description,
        severity: body.severity,
        status: body.status,
        evidenceDocumentIds: body.evidenceDocumentIds,
        noticeDate: body.noticeDate,
        hearingDate: body.hearingDate,
        resolutionNotes:
          body.resolutionNotes != null
            ? sanitizeHtml(body.resolutionNotes)
            : body.resolutionNotes,
      },
      requestId,
    );
  }),
);
