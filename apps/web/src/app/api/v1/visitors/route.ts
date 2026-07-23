/**
 * Visitors API — list + create visitor passes.
 *
 * Plan A1 drain #127. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and auth-chain rationale.
 */
import { runRoute } from '@propertypro/api-contract';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { parsePositiveInt } from '@/lib/finance/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  isResidentRole,
  requireActorUnitIds,
  requireStaffOperator,
  requireVisitorLoggingEnabled,
  requireVisitorsReadPermission,
  requireVisitorsWritePermission,
} from '@/lib/logistics/common';
import {
  createVisitorForCommunity,
  paginateVisitorsForCommunity,
} from '@/lib/services/package-visitor-service';
import { resolveUnitIdByLabel } from '@/lib/services/units-lookup';
import { visitorsCreateContract, visitorsListContract } from './contract';

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandler(
  runRoute(visitorsListContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireVisitorLoggingEnabled(membership);
    requireVisitorsReadPermission(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const { searchParams } = new URL(req.url);
    const rawHostUnitId = searchParams.get('hostUnitId');
    const hostUnitId = rawHostUnitId ? parsePositiveInt(rawHostUnitId, 'hostUnitId') : undefined;
    const onlyActive = searchParams.get('active') === 'true';
    const validGuestTypes = new Set(['one_time', 'recurring', 'permanent', 'vendor']);
    const validStatuses = new Set(['expected', 'checked_in', 'checked_out', 'expired', 'overstayed', 'revoked', 'revoked_on_site']);
    const rawGuestType = searchParams.get('guestType');
    const rawStatus = searchParams.get('status');
    const guestType = rawGuestType && validGuestTypes.has(rawGuestType) ? rawGuestType : undefined;
    const status = rawStatus && validStatuses.has(rawStatus) ? rawStatus : undefined;

    const parsedQuery = listQuerySchema.safeParse({
      cursor: searchParams.get('cursor') || undefined,
      pageSize: searchParams.get('pageSize') || undefined,
    });
    if (!parsedQuery.success) {
      throw new ValidationError('Invalid visitors query', {
        fields: formatZodErrors(parsedQuery.error),
      });
    }

    let allowedUnitIds: number[] | undefined;
    if (isResidentRole(membership.role)) {
      const scoped = createScopedClient(communityId);
      allowedUnitIds = await requireActorUnitIds(scoped, actorUserId);

      if (hostUnitId !== undefined && !allowedUnitIds.includes(hostUnitId)) {
        throw new ForbiddenError('You can only view visitors for your own unit');
      }
    }

    const result = await paginateVisitorsForCommunity(communityId, {
      cursor: parsedQuery.data.cursor,
      pageSize: parsedQuery.data.pageSize,
      hostUnitId,
      onlyActive,
      allowedUnitIds,
      guestType,
      status,
    });

    if (isResidentRole(membership.role)) {
      const sanitized = result.data.map(({ passCode: _, ...rest }) => rest);
      return {
        data: sanitized,
        pagination: result.pagination,
      };
    }

    return {
      data: result.data,
      pagination: result.pagination,
    };
  }),
);

export const POST = withErrorHandler(
  runRoute(visitorsCreateContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireVisitorLoggingEnabled(membership);
    requireVisitorsWritePermission(membership);

    const scoped = createScopedClient(communityId);

    const resolution = await resolveUnitIdByLabel(communityId, body.hostUnitLabel);
    if (resolution.kind !== 'resolved') {
      if (isResidentRole(membership.role)) {
        throw new ValidationError('Invalid visitor payload', {
          fields: { hostUnitLabel: 'Unit not found or not accessible' },
        });
      }
      throw new ValidationError('Invalid visitor payload', {
        fields: {
          hostUnitLabel:
            resolution.kind === 'ambiguous'
              ? 'Multiple units share this label; contact your administrator to resolve duplicates'
              : 'Unit not found',
        },
      });
    }
    const hostUnitId = resolution.unitId;
    const canonicalHostUnitLabel = resolution.unitNumber;

    if (isResidentRole(membership.role)) {
      const allowedUnitIds = await requireActorUnitIds(scoped, actorUserId);
      if (!allowedUnitIds.includes(hostUnitId)) {
        throw new ValidationError('Invalid visitor payload', {
          fields: { hostUnitLabel: 'Unit not found or not accessible' },
        });
      }
    } else {
      requireStaffOperator(membership);
    }

    const requestId = req.headers.get('x-request-id');
    return createVisitorForCommunity(
      communityId,
      actorUserId,
      {
        visitorName: body.visitorName,
        purpose: body.purpose,
        hostUnitId,
        hostUnitLabel: canonicalHostUnitLabel,
        expectedArrival: body.expectedArrival,
        notes: body.notes ?? null,
        guestType: body.guestType,
        validFrom: body.validFrom ?? null,
        validUntil: body.validUntil ?? null,
        recurrenceRule: body.recurrenceRule ?? null,
        expectedDurationMinutes: body.expectedDurationMinutes ?? null,
        vehicleMake: body.vehicleMake ?? null,
        vehicleModel: body.vehicleModel ?? null,
        vehicleColor: body.vehicleColor ?? null,
        vehiclePlate: body.vehiclePlate ?? null,
      },
      requestId,
    );
  }),
);
