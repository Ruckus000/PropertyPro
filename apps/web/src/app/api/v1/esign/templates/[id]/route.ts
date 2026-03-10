import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import * as esignService from '@/lib/services/esign-service';

export const GET = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const { id } = await params;
    const url = new URL(req.url);
    const communityId = Number(url.searchParams.get('communityId'));
    const effectiveCommunityId = resolveEffectiveCommunityId(req, communityId);
    const membership = await requireCommunityMembership(effectiveCommunityId, userId);
    requirePermission(membership.role, membership.communityType, 'esign', 'read');

    const template = await esignService.getTemplate(effectiveCommunityId, Number(id));
    if (!template) throw new NotFoundError('Template not found');

    return NextResponse.json({ data: template });
  },
);

export const DELETE = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const { id } = await params;
    const url = new URL(req.url);
    const communityId = Number(url.searchParams.get('communityId'));
    const effectiveCommunityId = resolveEffectiveCommunityId(req, communityId);
    const membership = await requireCommunityMembership(effectiveCommunityId, userId);
    requirePermission(membership.role, membership.communityType, 'esign', 'write');

    const archived = await esignService.archiveTemplate(
      effectiveCommunityId,
      Number(id),
      userId,
    );
    if (!archived) throw new NotFoundError('Template not found');

    return NextResponse.json({ data: { archived: true, id: Number(id) } });
  },
);
