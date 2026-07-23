/**
 * Assessments API — paginated list + create assessment.
 *
 * Plan A1 drain #128. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and auth-chain rationale.
 */
import { runRoute } from '@propertypro/api-contract';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import {
  requireFinanceAdminWrite,
  requireFinanceEnabled,
  requireFinanceReadPermission,
  requireFinanceWritePermission,
} from '@/lib/finance/common';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  createAssessmentForCommunity,
  paginateAssessmentsForCommunity,
} from '@/lib/services/finance-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { assessmentsCreateContract, assessmentsListContract } from './contract';

const listAssessmentsQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandler(
  runRoute(assessmentsListContract, async ({ req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req as NextRequest);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireFinanceEnabled(membership);
    requireFinanceReadPermission(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const searchParams = new URL(req.url).searchParams;
    const parsedQuery = listAssessmentsQuerySchema.safeParse({
      cursor: searchParams.get('cursor') || undefined,
      pageSize: searchParams.get('pageSize') || undefined,
    });

    if (!parsedQuery.success) {
      throw new ValidationError('Invalid assessments query', {
        fields: formatZodErrors(parsedQuery.error),
      });
    }

    const result = await paginateAssessmentsForCommunity(communityId, {
      cursor: parsedQuery.data.cursor,
      pageSize: parsedQuery.data.pageSize,
    });

    return {
      data: result.data,
      pagination: result.pagination,
    };
  }),
);

export const POST = withErrorHandler(
  runRoute(assessmentsCreateContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireFinanceEnabled(membership);
    requireFinanceWritePermission(membership);
    requireFinanceAdminWrite(membership);
    await requireActiveSubscriptionForMutation(communityId);

    const requestId = req.headers.get('x-request-id');
    return createAssessmentForCommunity(
      communityId,
      actorUserId,
      {
        title: body.title,
        description: body.description ?? null,
        amountCents: body.amountCents,
        frequency: body.frequency,
        dueDay: body.dueDay ?? null,
        lateFeeAmountCents: body.lateFeeAmountCents ?? 0,
        lateFeeDaysGrace: body.lateFeeDaysGrace ?? 0,
        startDate: body.startDate,
        endDate: body.endDate ?? null,
        isActive: body.isActive ?? true,
      },
      requestId,
    );
  }),
);
