/**
 * Violations API.
 *
 * GET   /api/v1/violations  — paginated violations list (Plan B3 rollout)
 * POST  /api/v1/violations  — create a new violation
 *
 * Plan A1 auto-drain — both methods migrated to `runRoute(contract, handler)`;
 * see `./contract.ts` for schemas and rationale.
 *
 * GET pagination (Plan B3):
 * - Cursor-based via `paginateViolationsForCommunity()` on `violations-service`.
 * - Filters (`status`, `severity`, `unitId`, `createdAfter`, `createdBefore`,
 *   and the resident-role `allowedUnitIds` safeguard) are parsed in-handler
 *   from `URL.searchParams` (NOT Zod) and pushed into the SQL `where`
 *   predicate by the service helper.
 * - Order by `id` desc — monotonic bigserial PKs.
 * - Response envelope: `{ data: { data: ViolationRecord[], pagination } }`.
 *
 * Resident-with-no-units short circuit preserved inside the service helper.
 *
 * `communityId` resolution stays on `parseCommunityIdFromQuery` /
 * `parseCommunityIdFromBody` (NOT the contract schema) so the pre-migration
 * `BadRequestError` messages are preserved byte-identically.
 */
import { runRoute } from '@propertypro/api-contract';
import {
  createScopedClient,
  type ViolationSeverity,
  type ViolationStatus,
} from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { parsePositiveInt } from '@/lib/finance/common';
import { getActorUnitIds, isResidentRole, requireViolationsEnabled } from '@/lib/violations/common';
import { requirePermission } from '@/lib/db/access-control';
import {
  createViolationForCommunity,
  paginateViolationsForCommunity,
  unitExistsInCommunity,
} from '@/lib/services/violations-service';
import { z } from 'zod';
import { violationsCreateContract, violationsListContract } from './contract';

const listStatusSchema = z.enum([
  'reported',
  'noticed',
  'hearing_scheduled',
  'fined',
  'resolved',
  'dismissed',
]);

const listSeveritySchema = z.enum(['minor', 'moderate', 'major']);

export const GET = withErrorHandler(
  runRoute(violationsListContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireViolationsEnabled(membership);
    requirePermission(membership, 'violations', 'read');

    const { searchParams } = new URL(req.url);
    const rawUnitId = searchParams.get('unitId');
    const rawStatus = searchParams.get('status');
    const rawSeverity = searchParams.get('severity');
    const createdAfter = searchParams.get('createdAfter') ?? undefined;
    const createdBefore = searchParams.get('createdBefore') ?? undefined;

    const unitId = rawUnitId ? parsePositiveInt(rawUnitId, 'unitId') : undefined;

    // Validate enum query params via safeParse + throw new ValidationError so
    // that invalid client input produces a 400 with a structured error envelope
    // instead of falling through `withErrorHandler`'s generic 500 + Sentry path.
    let status: ViolationStatus | undefined;
    if (rawStatus) {
      const parsed = listStatusSchema.safeParse(rawStatus);
      if (!parsed.success) {
        throw new ValidationError('Invalid status filter', {
          fields: [{
            field: 'status',
            message: `status must be one of: ${listStatusSchema.options.join(', ')}`,
          }],
        });
      }
      status = parsed.data as ViolationStatus;
    }

    let severity: ViolationSeverity | undefined;
    if (rawSeverity) {
      const parsed = listSeveritySchema.safeParse(rawSeverity);
      if (!parsed.success) {
        throw new ValidationError('Invalid severity filter', {
          fields: [{
            field: 'severity',
            message: `severity must be one of: ${listSeveritySchema.options.join(', ')}`,
          }],
        });
      }
      severity = parsed.data as ViolationSeverity;
    }

    const scoped = createScopedClient(communityId);
    const residentUnitIds = isResidentRole(membership.role)
      ? await getActorUnitIds(scoped, actorUserId)
      : undefined;

    if (residentUnitIds && unitId !== undefined && !residentUnitIds.includes(unitId)) {
      throw new ForbiddenError('You can only view violations for your own unit');
    }

    const result = await paginateViolationsForCommunity({
      communityId,
      cursor: query.cursor,
      pageSize: query.pageSize,
      status,
      severity,
      unitId,
      allowedUnitIds: residentUnitIds,
      createdAfter,
      createdBefore,
    });

    return { data: result.data, pagination: result.pagination };
  }),
);

export const POST = withErrorHandler(
  runRoute(violationsCreateContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireViolationsEnabled(membership);
    requirePermission(membership, 'violations', 'write');

    const scoped = createScopedClient(communityId);
    if (isResidentRole(membership.role)) {
      const unitIds = await getActorUnitIds(scoped, actorUserId);
      if (unitIds.length === 0) {
        throw new ForbiddenError('You must be associated with a unit before reporting a violation');
      }
      if (!unitIds.includes(body.unitId)) {
        throw new ForbiddenError('Residents can only report violations for their own unit');
      }
    } else {
      // Staff path: validate target unit belongs to this scoped community.
      const exists = await unitExistsInCommunity(communityId, body.unitId);
      if (!exists) {
        throw new NotFoundError(`Unit ${body.unitId} not found in this community`);
      }
    }

    const requestId = req.headers.get('x-request-id');
    return createViolationForCommunity(
      communityId,
      actorUserId,
      {
        unitId: body.unitId,
        category: body.category,
        description: body.description,
        severity: body.severity as ViolationSeverity | undefined,
        evidenceDocumentIds: body.evidenceDocumentIds,
      },
      requestId,
    );
  }),
);
