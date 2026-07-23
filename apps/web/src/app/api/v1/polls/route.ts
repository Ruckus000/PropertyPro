/**
 * Polls API.
 *
 * GET   /api/v1/polls  — paginated polls list (Plan B3 rollout)
 * POST  /api/v1/polls  — create a new poll
 *
 * Plan A1 drain #95 — both methods migrated to `runRoute(contract, handler)`;
 * see `./contract.ts` for schemas and rationale.
 *
 * GET pagination (Plan B3):
 * - Cursor-based via `paginatePollsForCommunity()` on `polls-service`.
 * - Filters: `isActive` (default `true`), `includeEnded` (default `false`)
 *   parsed in-handler from URL search params (NOT Zod).
 * - Order by `id` desc — monotonic bigserial PKs.
 * - Response envelope: `{ data: { data: PollRecord[], pagination } }`.
 *
 * Time-dependent `endsAt` filter: `now` captured once per request.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import {
  requirePollCreatorRole,
  requirePollReadPermission,
  requirePollWritePermission,
  requirePollsEnabled,
} from '@/lib/polls/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import {
  createPollForCommunity,
  paginatePollsForCommunity,
} from '@/lib/services/polls-service';
import { pollsCreateContract, pollsListContract } from './contract';

function parseBooleanQuery(value: string | null | undefined, fallback: boolean): boolean {
  if (value === null || value === undefined) {
    return fallback;
  }
  return value === 'true' || value === '1';
}

export const GET = withErrorHandler(
  runRoute(pollsListContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requirePollsEnabled(membership);
    requirePollReadPermission(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const { searchParams } = new URL(req.url);
    const isActive = parseBooleanQuery(searchParams.get('isActive'), true);
    const includeEnded = parseBooleanQuery(searchParams.get('includeEnded'), false);

    const result = await paginatePollsForCommunity({
      communityId,
      cursor: query.cursor,
      pageSize: query.pageSize,
      isActive,
      includeEnded,
      now: new Date(),
    });

    return { data: result.data, pagination: result.pagination };
  }),
);

export const POST = withErrorHandler(
  runRoute(pollsCreateContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    await requireActiveSubscriptionForMutation(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requirePollsEnabled(membership);
    requirePollWritePermission(membership);
    requirePollCreatorRole(membership);

    return createPollForCommunity(
      communityId,
      actorUserId,
      {
        title: body.title,
        description: body.description ?? null,
        pollType: body.pollType,
        options: body.options,
        endsAt: body.endsAt ?? null,
      },
      req.headers.get('x-request-id'),
    );
  }),
);
