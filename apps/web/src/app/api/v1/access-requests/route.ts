/**
 * Access Requests API
 *
 * POST  /api/v1/access-requests  — public: submit a self-service resident access request
 * GET   /api/v1/access-requests  — admin: list pending access requests for review
 *
 * Plan A1 drain #113 — both methods migrated to `runRoute(contract, handler)`;
 * see `./contract.ts` for schemas and auth-chain rationale.
 *
 * POST is public (no session required) — registered in TOKEN_AUTH_ROUTES.
 *
 * GET pagination (Plan B3):
 * - Cursor-based via `paginatePendingAccessRequests` in access-request-service.
 * - Response envelope: `{ data: { data: AccessRequest[], pagination } }`.
 */
import { runRoute } from '@propertypro/api-contract';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import {
  paginatePendingAccessRequests,
  submitAccessRequest,
} from '@/lib/services/access-request-service';
import {
  accessRequestsListContract,
  accessRequestsSubmitContract,
} from './contract';

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const POST = withErrorHandler(
  runRoute(accessRequestsSubmitContract, async ({ body }) => {
    return submitAccessRequest(body);
  }),
);

export const GET = withErrorHandler(
  runRoute(accessRequestsListContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'residents', 'write');

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
