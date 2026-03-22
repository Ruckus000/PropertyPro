/**
 * Access Request Denial
 *
 * POST /api/v1/access-requests/[id]/deny — admin: deny a pending access request
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
import { denyAccessRequest } from '@/lib/services/access-request-service';

const denySchema = z.object({
  reason: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// POST — admin: deny an access request
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, null);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'residents', 'write');

    const body: unknown = await req.json();
    const parsed = denySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed');
    }

    await denyAccessRequest({
      requestId: Number(id),
      communityId: membership.communityId,
      reviewerId: userId,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ data: { success: true } });
  },
);
