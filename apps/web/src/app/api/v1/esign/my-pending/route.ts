/**
 * GET /api/v1/esign/my-pending?communityId=X
 *
 * Returns pending e-sign requests for the authenticated user.
 * Available to all roles with esign.read permission (owner, tenant, admin).
 *
 * Plan A3 Phase 2 (#242 follow-on): the email lookup that previously lived
 * inline in this route is now folded into `listMyPendingForActor` in the
 * esign-service. Drops the `createScopedClient` + `users` table imports
 * from the route, removing it from the third-boundary-guard allowlist.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { requireEsignReadPermission } from '@/lib/esign/esign-route-helpers';
import { listMyPendingForActor } from '@/lib/services/esign-service';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireEsignReadPermission(membership);

  const data = await listMyPendingForActor(communityId, actorUserId);

  return NextResponse.json({ data });
});
