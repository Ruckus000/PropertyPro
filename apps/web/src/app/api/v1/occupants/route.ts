/**
 * /api/v1/occupants — household members with no portal login (Directory).
 *
 * GET / POST / PATCH / DELETE, all manager-only: residents permission AND the
 * manager tier (isAdmin). A board seat is not enough — these are other
 * people's contact details, and the Residents tab they appear on is
 * manager-only too. Writes follow the resident write path's guards (demo
 * grace, active subscription).
 */
import { withErrorHandler } from '@/lib/api/error-handler';
import { runRoute } from '@/lib/api/run-route';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { createOccupant, paginateOccupants, removeOccupant, updateOccupant } from '@/lib/services/occupant-service';
import {
  occupantsCreateContract,
  occupantsDeleteContract,
  occupantsListContract,
  occupantsUpdateContract,
} from './contract';

async function requireManager(communityId: number, action: 'read' | 'write') {
  const actorUserId = await requireAuthenticatedUserId();
  if (action === 'write') await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requirePermission(membership, 'residents', action);
  if (!membership.isAdmin) throw new ForbiddenError('Only managers can see or change household members');
  if (action === 'write') await requireActiveSubscriptionForMutation(communityId);
  else await requireEntitledForAdminRead(communityId, membership);
  return actorUserId;
}

export const GET = withErrorHandler(
  runRoute(occupantsListContract, async ({ communityId, query }) => {
    await requireManager(communityId, 'read');
    return paginateOccupants(communityId, { cursor: query.cursor, pageSize: query.pageSize });
  }),
);

export const POST = withErrorHandler(
  runRoute(occupantsCreateContract, async ({ body, communityId }) => {
    const actor = await requireManager(communityId, 'write');
    return createOccupant(communityId, actor, {
      unitId: body.unitId,
      fullName: body.fullName,
      email: body.email ?? null,
      phone: body.phone ?? null,
      isOwnerHousehold: body.isOwnerHousehold,
    });
  }),
);

export const PATCH = withErrorHandler(
  runRoute(occupantsUpdateContract, async ({ body, communityId }) => {
    const actor = await requireManager(communityId, 'write');
    const { id, expectedUpdatedAt, communityId: _c, ...fields } = body;
    return updateOccupant(communityId, actor, id, fields, expectedUpdatedAt);
  }),
);

export const DELETE = withErrorHandler(
  runRoute(occupantsDeleteContract, async ({ body, communityId }) => {
    const actor = await requireManager(communityId, 'write');
    await removeOccupant(communityId, actor, body.id);
    return { success: true as const };
  }),
);
