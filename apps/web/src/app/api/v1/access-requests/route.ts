/**
 * GET /api/v1/access-requests — admin: list pending access requests for review.
 *
 * Cursor pagination (Plan B3) via `paginatePendingAccessRequests`; envelope
 * `{ data: { data: AccessRequest[], pagination } }`.
 *
 * The public submit (POST) and OTP verify routes were deleted on 2026-10-20:
 * nothing could reach them since #764, so no request can be created any more.
 */
import { runRoute } from '@propertypro/api-contract';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { requirePermission } from '@/lib/db/access-control';
import { paginatePendingAccessRequests } from '@/lib/services/access-request-service';
import { accessRequestsListContract } from './contract';

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandler(
  runRoute(accessRequestsListContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'residents', 'write');
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const { searchParams } = req.nextUrl;
    const parsedQuery = listQuerySchema.safeParse({
      cursor: searchParams.get('cursor') || undefined,
      pageSize: searchParams.get('pageSize') || undefined,
    });
    if (!parsedQuery.success) {
      throw new ValidationError('Invalid query parameters');
    }

    const result = await paginatePendingAccessRequests({
      communityId: membership.communityId,
      cursor: parsedQuery.data.cursor,
      pageSize: parsedQuery.data.pageSize,
    });

    return { data: result.data, pagination: result.pagination };
  }),
);
