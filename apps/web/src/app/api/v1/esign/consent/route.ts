import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { requireEsignReadPermission, requireEsignWritePermission } from '@/lib/esign/esign-route-helpers';
import { getConsentStatus, revokeConsent } from '@/lib/services/esign-service';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireEsignReadPermission(membership);

  const data = await getConsentStatus(communityId, actorUserId);
  return NextResponse.json({ data });
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireEsignWritePermission(membership);

  const requestId = req.headers.get('x-request-id');
  await revokeConsent(communityId, actorUserId, requestId);

  return NextResponse.json({ data: { success: true } });
});
