/**
 * Emergency Broadcast send API — confirm + execute broadcast.
 *
 * POST /api/v1/emergency-broadcasts/[id]/send — Execute broadcast
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { executeBroadcast } from '@/lib/services/emergency-broadcast-service';
import { z } from 'zod';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';

const sendSchema = z.object({
  communityId: z.number().int().positive(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const { id } = await params;
    const broadcastId = Number(id);

    if (!Number.isInteger(broadcastId) || broadcastId <= 0) {
      throw new ValidationError('Invalid broadcast ID');
    }

    const body = await req.json();
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request', { fields: formatZodErrors(parsed.error) });
    }

    const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'emergency_broadcasts', 'write');

    const result = await executeBroadcast(broadcastId, communityId, userId);

    return NextResponse.json(result);
  },
);
