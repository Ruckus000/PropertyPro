/**
 * Denied visitor detail mutations.
 *
 * PATCH  /api/v1/visitors/denied/[id] — update entry
 * DELETE /api/v1/visitors/denied/[id] — soft-delete entry
 *
 * Plan A1 drain #122. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`. Staff-only; mirrors collection #94 auth chain.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  requireStaffOperator,
  requireVisitorLoggingEnabled,
  requireVisitorsWritePermission,
} from '@/lib/logistics/common';
import {
  updateDeniedVisitor,
  softDeleteDeniedVisitor,
} from '@/lib/services/package-visitor-service';
import {
  visitorsDeniedDeleteContract,
  visitorsDeniedUpdateContract,
} from './contract';

export const PATCH = withErrorHandler(
  runRoute(visitorsDeniedUpdateContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();

    if (
      body.fullName === undefined
      && body.reason === undefined
      && body.vehiclePlate === undefined
      && body.notes === undefined
      && body.isActive === undefined
    ) {
      throw new ValidationError('At least one field must be provided for update');
    }

    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireVisitorLoggingEnabled(membership);
    requireVisitorsWritePermission(membership);
    requireStaffOperator(membership);

    const { communityId: _communityId, ...input } = body;
    return updateDeniedVisitor(
      communityId,
      params.id,
      actorUserId,
      input,
      req.headers.get('x-request-id'),
    );
  }),
);

export const DELETE = withErrorHandler(
  runRoute(visitorsDeniedDeleteContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireVisitorLoggingEnabled(membership);
    requireVisitorsWritePermission(membership);
    requireStaffOperator(membership);

    await softDeleteDeniedVisitor(
      communityId,
      params.id,
      actorUserId,
      req.headers.get('x-request-id'),
    );

    return { success: true as const };
  }),
);
