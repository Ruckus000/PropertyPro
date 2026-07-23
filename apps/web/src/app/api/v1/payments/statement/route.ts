/**
 * Payments statement — unit or community rollup.
 *
 * Plan A1 drain #133. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and auth-chain rationale.
 */
import { runRoute } from '@propertypro/api-contract';
import type { NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError, ForbiddenError } from '@/lib/api/errors';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { parsePositiveInt, requireFinanceEnabled, requireFinanceReadPermission } from '@/lib/finance/common';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  buildCommunityStatement,
  buildUnitStatement,
  listActorUnitIdsForFinance,
  resolveStatementDateRange,
} from '@/lib/services/finance-service';
import { paymentStatementContract } from './contract';

export const GET = withErrorHandler(
  runRoute(paymentStatementContract, async ({ req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req as NextRequest);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requireFinanceEnabled(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const searchParams = new URL(req.url).searchParams;
    const rawUnitId = searchParams.get('unitId');
    const rawStartDate = searchParams.get('startDate');
    const rawEndDate = searchParams.get('endDate');

    const { startDate, endDate } = resolveStatementDateRange(rawStartDate, rawEndDate);

    if (membership.role === 'resident' && membership.isUnitOwner) {
      const actorUnitIds = await listActorUnitIdsForFinance(communityId, actorUserId);
      if (actorUnitIds.length === 0) {
        throw new ForbiddenError('No unit association found for this owner');
      }

      let unitId: number;
      if (rawUnitId) {
        const requestedUnitId = parsePositiveInt(rawUnitId, 'unitId');
        if (!actorUnitIds.includes(requestedUnitId)) {
          throw new ForbiddenError('Owners can only access statements for their own unit');
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

      const statement = await buildUnitStatement(communityId, unitId, startDate, endDate);
      return { mode: 'unit' as const, statement };
    }

    requireFinanceReadPermission(membership);

    if (rawUnitId) {
      const unitId = parsePositiveInt(rawUnitId, 'unitId');
      const statement = await buildUnitStatement(communityId, unitId, startDate, endDate);
      return { mode: 'unit' as const, statement };
    }

    const communityStatement = await buildCommunityStatement(communityId, startDate, endDate);
    return { mode: 'community' as const, statement: communityStatement };
  }),
);
