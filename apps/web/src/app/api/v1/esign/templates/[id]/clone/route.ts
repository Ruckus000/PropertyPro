import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requirePermission } from '@/lib/db/access-control';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import * as esignService from '@/lib/services/esign-service';

const cloneSchema = z.object({
  communityId: z.number().int().positive(),
  name: z.string().min(1).max(500),
});

export const POST = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const { id } = await params;
    const body = await req.json();
    const parsed = cloneSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', { fields: formatZodErrors(parsed.error) });
    }

    const effectiveCommunityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
    const membership = await requireCommunityMembership(effectiveCommunityId, userId);
    requirePermission(membership.role, membership.communityType, 'esign', 'write');
    await requireActiveSubscriptionForMutation(effectiveCommunityId);

    const clone = await esignService.cloneTemplate(
      effectiveCommunityId,
      Number(id),
      userId,
      parsed.data.name,
    );
    if (!clone) throw new NotFoundError('Template not found');

    return NextResponse.json({ data: clone }, { status: 201 });
  },
);
