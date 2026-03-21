/**
 * GET /api/v1/esign/my-pending?communityId=X
 *
 * Returns pending e-sign requests for the authenticated user.
 * Available to all roles with esign.read permission (owner, tenant, admin).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createScopedClient, users } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { requireEsignReadPermission } from '@/lib/esign/esign-route-helpers';
import { listMyPendingSigners } from '@/lib/services/esign-service';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireEsignReadPermission(membership);

  // Look up the user's email (needed to match signers by email as well as userId)
  const scoped = createScopedClient(communityId);
  const userRows = await scoped.query(users);
  const user = userRows.find((row) => row['id'] === actorUserId);
  const userEmail = typeof user?.['email'] === 'string' ? (user['email'] as string) : '';

  const data = await listMyPendingSigners(communityId, actorUserId, userEmail);

  return NextResponse.json({ data });
});
