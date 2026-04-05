/**
 * POST /api/v1/admin/join-requests/[id]/approve
 *
 * Admin action: approve a pending community join request. Creates a
 * user_roles row for the requester and marks the request approved.
 *
 * Requires an authenticated admin with residents.write permission in the
 * target community (resolved via x-community-id header).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { ValidationError, NotFoundError, ForbiddenError } from '@/lib/api/errors';
import { approveJoinRequest } from '@/lib/join-requests/approve-request';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communityJoinRequests, logAuditEvent } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

const bodySchema = z.object({ notes: z.string().max(500).optional() });

export const POST = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, null);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'residents', 'write');

    const requestId = Number(id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new ValidationError('Invalid request ID');
    }

    const rawBody: unknown = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError('Invalid body');
    }

    // Verify the request belongs to the admin's community before mutating
    const db = createUnscopedClient();
    const [existing] = await db
      .select({
        id: communityJoinRequests.id,
        communityId: communityJoinRequests.communityId,
      })
      .from(communityJoinRequests)
      .where(eq(communityJoinRequests.id, requestId))
      .limit(1);

    if (!existing) throw new NotFoundError('Join request not found');
    if (existing.communityId !== communityId) {
      throw new ForbiddenError('Request belongs to a different community');
    }

    const result = await approveJoinRequest({
      requestId,
      reviewerUserId: userId,
      notes: parsed.data.notes,
    });

    await logAuditEvent({
      userId,
      communityId,
      action: 'join_request.approved',
      resourceType: 'community_join_request',
      resourceId: String(requestId),
      metadata: { notes: parsed.data.notes ?? null },
    });

    return NextResponse.json({ data: result });
  },
);
