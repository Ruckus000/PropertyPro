/**
 * Access Request Approval
 *
 * POST /api/v1/access-requests/[id]/approve — admin: approve a pending access request
 *
 * Invariants:
 * - Requires authentication and residents.write permission
 * - withErrorHandler for structured errors
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { approveAccessRequest } from '@/lib/services/access-request-service';

const approveSchema = z.object({
  unitId: z.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// POST — admin: approve an access request
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, null);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'residents', 'write');

    const body: unknown = await req.json();
    const parsed = approveSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed');
    }

    const result = await approveAccessRequest({
      requestId: Number(id),
      communityId: membership.communityId,
      reviewerId: userId,
      unitId: parsed.data.unitId,
    });
    return NextResponse.json({ data: result });
  },
);
