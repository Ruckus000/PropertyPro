import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requirePermission } from '@/lib/db/access-control';
import * as esignService from '@/lib/services/esign-service';

const remindSchema = z.object({
  communityId: z.number().int().positive(),
  signerId: z.number().int().positive(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const { id } = await params;
    const body = await req.json();
    const parsed = remindSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', { fields: formatZodErrors(parsed.error) });
    }

    const effectiveCommunityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
    const membership = await requireCommunityMembership(effectiveCommunityId, userId);
    requirePermission(membership.role, membership.communityType, 'esign', 'write');

    const signer = await esignService.sendReminder(
      effectiveCommunityId,
      Number(id),
      parsed.data.signerId,
      userId,
    );
    if (!signer) throw new NotFoundError('Signer not found or not in pending status');

    return NextResponse.json({ data: { reminded: true } });
  },
);
