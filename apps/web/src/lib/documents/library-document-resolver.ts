import type { NextRequest } from 'next/server';
import { getDocumentWithAccessCheck } from '@propertypro/db';
import { NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';

interface ResolveLibraryDocumentInput {
  req: NextRequest;
  communityId: number;
  documentId: number;
}

export async function resolveLibraryDocumentRequest({
  req,
  communityId: requestedCommunityId,
  documentId,
}: ResolveLibraryDocumentInput): Promise<{
  userId: string;
  communityId: number;
  document: Record<string, unknown>;
}> {
  const userId = await requireAuthenticatedUserId();
  const communityId = resolveEffectiveCommunityId(req, requestedCommunityId);
  const membership = await requireCommunityMembership(communityId, userId);

  const document = await getDocumentWithAccessCheck(
    {
      communityId,
      role: membership.role,
      communityType: membership.communityType,
      isUnitOwner: membership.isUnitOwner,
      permissions: membership.permissions,
    },
    documentId,
  );

  if (!document) {
    throw new NotFoundError('Document not found');
  }

  return {
    userId,
    communityId,
    document,
  };
}
