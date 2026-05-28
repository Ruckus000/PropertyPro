/**
 * `POST /api/v1/visitors/[id]/revoke` — visitor pass revocation.
 *
 * Migrated to the canonical `runRoute(visitorsRevokeContract, ...)` envelope
 * as part of Plan A1 drain #93. See `./contract.ts` for the request/response
 * schema, the verbatim-preserved auth chain, and the three-way authorization
 * branch (admin / resident / other).
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { ValidationError, ForbiddenError } from '@/lib/api/errors';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  requireVisitorLoggingEnabled,
  requireVisitorsWritePermission,
  isResidentRole,
} from '@/lib/logistics/common';
import {
  getVisitorHostUserId,
  isResidentVisitorRevokeEnabled,
  revokeVisitorForCommunity,
} from '@/lib/services/package-visitor-service';
import { visitorsRevokeContract } from './contract';

export const POST = withErrorHandler(
  runRoute(visitorsRevokeContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireVisitorLoggingEnabled(membership);
    requireVisitorsWritePermission(membership);

    if (membership.isAdmin) {
      if (!body.reason) {
        throw new ValidationError('Reason is required for staff revocations');
      }
    } else if (isResidentRole(membership.role)) {
      if (!(await isResidentVisitorRevokeEnabled(communityId))) {
        throw new ForbiddenError(
          'Resident visitor pass revocation is not enabled for this community',
        );
      }

      const hostUserId = await getVisitorHostUserId(communityId, params.id);
      if (hostUserId === null || hostUserId !== actorUserId) {
        throw new ForbiddenError('You can only revoke passes you registered');
      }
    } else {
      throw new ForbiddenError('Only staff or the registering resident can revoke a pass');
    }

    return revokeVisitorForCommunity(
      communityId,
      params.id,
      actorUserId,
      body.reason ?? null,
      req.headers.get('x-request-id'),
    );
  }),
);
