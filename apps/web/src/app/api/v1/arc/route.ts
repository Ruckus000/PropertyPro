/**
 * ARC Submissions API.
 *
 * GET   /api/v1/arc  — paginated ARC submissions (Plan B3 rollout)
 * POST  /api/v1/arc  — create a new ARC submission
 *
 * Plan A1 drain #173 — both methods migrated to `runRoute(contract, handler)`;
 * see `./contract.ts`.
 *
 * GET pagination (Plan B3):
 * - Cursor-based via `paginateArcSubmissionsForCommunity()`.
 * - Filters push into SQL via the service helper.
 * - Order by `id` desc — monotonic bigserial PKs.
 * - Response envelope: `{ data: { data: ArcSubmission[], pagination } }`.
 *
 * Resident-with-no-units short circuit preserved in-handler before paginate.
 */
import { runRoute } from '@propertypro/api-contract';
import type { ArcSubmissionStatus } from '@propertypro/db';
import { createScopedClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  getActorUnitIds,
  isResidentRole,
  requireArcEnabled,
  requireArcSubmitterRole,
} from '@/lib/violations/common';
import {
  createArcSubmissionForCommunity,
  paginateArcSubmissionsForCommunity,
} from '@/lib/services/violations-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePermission } from '@/lib/db/access-control';
import { z } from 'zod';
import { arcCreateContract, arcListContract } from './contract';

const listArcStatusSchema = z.enum([
  'submitted',
  'under_review',
  'approved',
  'denied',
  'withdrawn',
]);

export const GET = withErrorHandler(
  runRoute(arcListContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireArcEnabled(membership);
    requirePermission(membership, 'arc_submissions', 'read');

    const { searchParams } = new URL(req.url);
    const rawStatus = searchParams.get('status');
    const parsedStatus = rawStatus ? listArcStatusSchema.safeParse(rawStatus) : null;
    if (rawStatus && !parsedStatus?.success) {
      throw new ValidationError('Invalid ARC status filter', {
        fields: [
          {
            field: 'status',
            message:
              'status must be one of submitted, under_review, approved, denied, withdrawn',
          },
        ],
      });
    }

    const status = parsedStatus?.success
      ? (parsedStatus.data as ArcSubmissionStatus)
      : undefined;
    const unitId = query.unitId;

    const scoped = createScopedClient(communityId);
    const residentUnitIds = isResidentRole(membership.role)
      ? await getActorUnitIds(scoped, actorUserId)
      : undefined;

    if (residentUnitIds && unitId !== undefined && !residentUnitIds.includes(unitId)) {
      throw new ForbiddenError('You can only view ARC submissions for your own unit');
    }

    const result = await paginateArcSubmissionsForCommunity({
      communityId,
      cursor: query.cursor,
      pageSize: query.pageSize,
      status,
      unitId,
      allowedUnitIds: residentUnitIds,
    });

    return { data: result.data, pagination: result.pagination };
  }),
);

export const POST = withErrorHandler(
  runRoute(arcCreateContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireArcEnabled(membership);
    requirePermission(membership, 'arc_submissions', 'write');
    requireArcSubmitterRole(membership);

    const scoped = createScopedClient(communityId);
    const unitIds = await getActorUnitIds(scoped, actorUserId);
    if (!unitIds.includes(body.unitId)) {
      throw new ForbiddenError(
        'Residents can only submit ARC applications for their own unit',
      );
    }

    const requestId = req.headers.get('x-request-id');
    return createArcSubmissionForCommunity(
      communityId,
      actorUserId,
      {
        unitId: body.unitId,
        title: body.title,
        description: body.description,
        projectType: body.projectType,
        estimatedStartDate: body.estimatedStartDate ?? null,
        estimatedCompletionDate: body.estimatedCompletionDate ?? null,
        attachmentDocumentIds: body.attachmentDocumentIds,
      },
      requestId,
    );
  }),
);
