/**
 * Packages API — staff package log.
 *
 * GET   /api/v1/packages  — paginated package log (Plan B3 rollout)
 * POST  /api/v1/packages  — create a new package log entry
 *
 * GET pagination (Plan B3):
 * - Cursor-based via the canonical `paginate()` helper from `@propertypro/db`.
 * - Filters (`status`, `unitId`, and the resident-role `allowedUnitIds`
 *   safeguard) are pushed into the SQL `where` predicate. Previously the
 *   underlying service fetched the whole tenant's package log and returned
 *   it unbounded.
 * - Order by `id` desc — for monotonic bigserial PKs this is equivalent to
 *   the previous `(createdAt desc, id desc)` composite ordering.
 * - Response envelope is double-wrapped per the paginated-route contract:
 *   `{ data: { data: PackageLog[], pagination: { nextCursor, hasMore, pageSize } } }`.
 *
 * Note: `/api/v1/packages/my` is intentionally NOT migrated in this PR — it
 * has its own service path (`listMyPackagesForCommunity`) that filters out
 * `picked_up` entries, and the resident-facing UI relies on the flat shape.
 */
import { runRoute } from '@propertypro/api-contract';
import type { NextRequest } from 'next/server';
import { createScopedClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError, ForbiddenError } from '@/lib/api/errors';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  isResidentRole,
  requireActorUnitIds,
  requirePackageLoggingEnabled,
  requirePackagesReadPermission,
  requirePackagesWritePermission,
  requireStaffOperator,
} from '@/lib/logistics/common';
import {
  createPackageForCommunity,
  paginatePackageLog,
} from '@/lib/services/package-visitor-service';
import { resolveUnitIdByLabel } from '@/lib/services/units-lookup';
import { packagesCreateContract, packagesListContract } from './contract';

export const GET = withErrorHandler(
  runRoute(packagesListContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req as NextRequest);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requirePackageLoggingEnabled(membership);
    requirePackagesReadPermission(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const status = query.status;
    const unitId = query.unitId;

    const scoped = createScopedClient(communityId);

    let allowedUnitIds: number[] | undefined;
    if (isResidentRole(membership.role)) {
      allowedUnitIds = await requireActorUnitIds(scoped, actorUserId);

      if (unitId !== undefined && !allowedUnitIds.includes(unitId)) {
        throw new ForbiddenError('You can only view packages for your own unit');
      }
    }

    const result = await paginatePackageLog({
      communityId,
      cursor: query.cursor,
      pageSize: query.pageSize,
      status,
      unitId,
      allowedUnitIds,
    });

    return {
      data: result.data,
      pagination: result.pagination,
    };
  }),
);

export const POST = withErrorHandler(
  runRoute(packagesCreateContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req as NextRequest, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requirePackageLoggingEnabled(membership);
    requirePackagesWritePermission(membership);
    requireStaffOperator(membership);

    const resolution = await resolveUnitIdByLabel(communityId, body.unitNumber);
    if (resolution.kind === 'ambiguous') {
      throw new ValidationError(
        `Multiple units share "${body.unitNumber}". Contact your administrator to resolve duplicates.`,
      );
    }
    if (resolution.kind !== 'resolved') {
      throw new ValidationError(
        `No unit found with number "${body.unitNumber}". Please check the unit number and try again.`,
      );
    }

    return await createPackageForCommunity(
      communityId,
      actorUserId,
      {
        unitId: resolution.unitId,
        recipientName: body.recipientName,
        carrier: body.carrier,
        trackingNumber: body.trackingNumber ?? null,
        notes: body.notes ?? null,
      },
      req.headers.get('x-request-id'),
    );
  }),
);
