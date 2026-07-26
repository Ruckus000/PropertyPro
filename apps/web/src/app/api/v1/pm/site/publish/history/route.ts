/**
 * GET /api/v1/pm/site/publish/history — the community's publish log.
 *
 * Website editor v3, Phase 6. Newest first, cursor-paginated per ADR-003.
 *
 * Authorization: the same `ensurePmAccess` chain the sibling site routes use
 * (auth → effective community → membership → PM_MANAGER_ROLES → hasSiteEditor),
 * plus `requireEntitledForAdminRead` because this is an admin GET.
 *
 * The query lives in `paginateSitePublishHistory`, not here — ADR-003, enforced by
 * `guard:route-table-imports`. That service function is also the single place
 * that decides `snapshot` is read but never returned: `paginate` selects every
 * column, so the payload IS loaded, and only the derived boolean `restorable`
 * escapes.
 *
 * PLAN GATE — NOT IMPLEMENTED, ON PURPOSE. Gap-analysis decision 5 makes the
 * full history log Professional-only while one-step revert stays on every plan.
 * That needs a `hasSitePublishHistory` flag, which is not a one-file change:
 * it means `CommunityFeatures` + all three community-type rows in
 * `community-features.ts` + the plan rows in `plan-features.ts` + the two
 * exhaustive `ALL_FEATURE_KEYS` lists in `packages/shared/src/__tests__`, which
 * are outside this change's scope. Half-adding a plan flag is worse than not
 * adding one, so the tier gate is deferred rather than faked. Adding it later
 * is one line here: `await requirePlanFeature(communityId, 'hasSitePublishHistory')`.
 */
import { runRoute } from '@propertypro/api-contract';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { paginateSitePublishHistory } from '@/lib/services/site-blocks-service';
import { publishHistoryListContract } from './contract';
import type { NextRequest } from 'next/server';

async function ensurePmAccess(req: NextRequest, communityId: number) {
  const userId = await requireAuthenticatedUserId();
  const effective = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effective, userId);
  requireRole(membership, PM_MANAGER_ROLES, 'Only property managers can view the publish history');
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective, membership };
}

/**
 * Parsed from `req.nextUrl` rather than the contract's query schema, with `||`
 * (not `??`) so `?cursor=` / `?pageSize=` read as missing instead of failing
 * the `min(1)` / `positive()` constraints.
 */
const listQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandler(
  runRoute(publishHistoryListContract, async ({ query, req }) => {
    const { communityId, membership } = await ensurePmAccess(req, query.communityId);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const { searchParams } = req.nextUrl;
    const parsedQuery = listQuerySchema.safeParse({
      cursor: searchParams.get('cursor') || undefined,
      pageSize: searchParams.get('pageSize') || undefined,
    });
    if (!parsedQuery.success) {
      throw new ValidationError('Invalid query parameters');
    }

    const result = await paginateSitePublishHistory({
      communityId,
      cursor: parsedQuery.data.cursor,
      pageSize: parsedQuery.data.pageSize,
    });

    // Fields are listed one by one, NOT spread. The service already drops
    // `snapshot`, but this is the wire boundary: an allowlist here means a
    // future column on the row cannot reach a client just by existing.
    return {
      data: result.data.map((row) => ({
        id: row.id,
        publishedAt: row.publishedAt.toISOString(),
        actorUserId: row.actorUserId,
        changeCount: row.changeCount,
        changeLabels: row.changeLabels,
        restorable: row.restorable,
      })),
      pagination: result.pagination,
    };
  }),
);
