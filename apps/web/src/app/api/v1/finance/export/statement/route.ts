import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError, ForbiddenError } from '@/lib/api/errors';
import { parsePositiveInt, requireFinanceEnabled, requireFinanceReadPermission } from '@/lib/finance/common';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import {
  exportCommunityStatementPdf,
  exportStatementPdf,
  listActorUnitIdsForFinance,
  resolveStatementDateRange,
} from '@/lib/services/finance-service';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  await requireFinanceEnabled(membership);

  const searchParams = new URL(req.url).searchParams;
  const rawUnitId = searchParams.get('unitId');
  const rawStartDate = searchParams.get('startDate');
  const rawEndDate = searchParams.get('endDate');
  const { startDate, endDate } = resolveStatementDateRange(rawStartDate, rawEndDate);

  // Resident / unit-owner path — preserve existing behaviour exactly.
  if (membership.role === 'resident' && membership.isUnitOwner) {
    const actorUnitIds = await listActorUnitIdsForFinance(communityId, actorUserId);
    if (actorUnitIds.length === 0) {
      throw new ForbiddenError('No unit association found for this owner');
    }

    let unitId: number;
    if (rawUnitId) {
      const requestedUnitId = parsePositiveInt(rawUnitId, 'unitId');
      if (!actorUnitIds.includes(requestedUnitId)) {
        throw new ForbiddenError('Owners can only export statements for their own unit');
      }
      unitId = requestedUnitId;
    } else if (actorUnitIds.length === 1) {
      const onlyUnitId = actorUnitIds[0];
      if (onlyUnitId === undefined) {
        throw new ForbiddenError('No unit association found for this owner');
      }
      unitId = onlyUnitId;
    } else {
      throw new BadRequestError(
        'unitId query parameter is required when you are associated with multiple units',
      );
    }

    const pdf = await exportStatementPdf(communityId, unitId, startDate, endDate);
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename=\"statement-community-${communityId}-unit-${unitId}.pdf\"`,
      },
    });
  }

  // Staff / manager path — unit-scoped when unitId provided, else community rollup.
  requireFinanceReadPermission(membership);
  // Lapsed communities lose admin reads (residents unaffected — resident-owner
  // branch above returns early; guard also short-circuits on isAdmin=false).
  await requireEntitledForAdminRead(communityId, membership);

  if (rawUnitId) {
    const unitId = parsePositiveInt(rawUnitId, 'unitId');
    const pdf = await exportStatementPdf(communityId, unitId, startDate, endDate);
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename=\"statement-community-${communityId}-unit-${unitId}.pdf\"`,
      },
    });
  }

  const pdf = await exportCommunityStatementPdf(communityId, startDate, endDate);
  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename=\"statement-community-${communityId}.pdf\"`,
    },
  });
});
