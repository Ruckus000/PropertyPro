/**
 * Denied Visitors API.
 *
 * GET   /api/v1/visitors/denied  — paginated denied-visitor list (Plan B3)
 * POST  /api/v1/visitors/denied  — create a new denied-visitor entry
 *
 * Plan A1 drain #94. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and auth-chain rationale.
 *
 * GET pagination (Plan B3, A3 service wrapper):
 * - Cursor-based via `paginateDeniedVisitors` in package-visitor-service.
 * - Optional `active` filter is tri-state-parsed from `req.url` (not Zod).
 * - Handler returns the INNER paginated shape; runner builds
 *   `{ data: { data: DeniedVisitorRow[], pagination } }`.
 *
 * Staff-only: `requireStaffOperator(membership)` blocks residents at the
 * authorization layer.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  requireStaffOperator,
  requireVisitorLoggingEnabled,
  requireVisitorsReadPermission,
  requireVisitorsWritePermission,
} from '@/lib/logistics/common';
import {
  createDeniedVisitor,
  paginateDeniedVisitors,
} from '@/lib/services/package-visitor-service';
import {
  visitorsDeniedCreateContract,
  visitorsDeniedListContract,
} from './contract';

export const GET = withErrorHandler(
  runRoute(visitorsDeniedListContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireVisitorLoggingEnabled(membership);
    requireVisitorsReadPermission(membership);
    requireStaffOperator(membership);

    const { searchParams } = new URL(req.url);
    const rawActive = searchParams.get('active');
    const onlyActive =
      rawActive === 'true' ? true : rawActive === 'false' ? false : undefined;

    const result = await paginateDeniedVisitors({
      communityId,
      cursor: query.cursor,
      pageSize: query.pageSize,
      onlyActive,
    });

    return { data: result.data, pagination: result.pagination };
  }),
);

export const POST = withErrorHandler(
  runRoute(visitorsDeniedCreateContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireVisitorLoggingEnabled(membership);
    requireVisitorsWritePermission(membership);
    requireStaffOperator(membership);

    return createDeniedVisitor(
      communityId,
      actorUserId,
      {
        fullName: body.fullName,
        reason: body.reason,
        vehiclePlate: body.vehiclePlate ?? null,
        notes: body.notes ?? null,
      },
      req.headers.get('x-request-id'),
    );
  }),
);
