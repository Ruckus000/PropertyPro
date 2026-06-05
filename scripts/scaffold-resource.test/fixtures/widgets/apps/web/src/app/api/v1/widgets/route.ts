/**
 * GET /api/v1/widgets
 *
 * Lists widgets for a community. Cursor-based keyset pagination via the
 * canonical `paginate()` helper (Plan A2 / ADR-003).
 *
 * Scaffolded by `pnpm new:resource widgets` (Plan A4 reference resource).
 *
 * Input validation (`query`) and output validation + canonical envelope
 * wrapping are delegated to `runRoute()` from `@/lib/api/run-route` (the
 * app-bound wrapper, Plan A1 + B2). The contract's
 * `tenantScope: { in: 'query' }` makes the runner resolve `communityId`
 * (reconciling the `x-community-id` header against `query.communityId`,
 * failing closed on a forged/mismatched header) and inject it into the handler
 * input. The wire response is the canonical double-wrapped envelope:
 *
 *     { data: { data: Widget[], pagination: { nextCursor, hasMore, pageSize } } }
 *
 * Auth chain (do NOT reorder):
 *   1. `requireAuthenticatedUserId()` — Supabase session + support-session
 *      `x-user-id` override.
 *   2. `communityId` — injected by the runner from `tenantScope` (above).
 *   3. `requireCommunityMembership(communityId, userId)` — confirms the
 *      actor is a member of the resolved tenant. Throws 403 otherwise.
 */
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { paginateWidgets } from '@/lib/services/widgets-service';
import { widgetsListContract } from './contract';

export const GET = withErrorHandler(
  runRoute(widgetsListContract, async ({ query, communityId }) => {
    const userId = await requireAuthenticatedUserId();
    await requireCommunityMembership(communityId, userId);

    const result = await paginateWidgets({
      communityId,
      cursor: query.cursor,
      pageSize: query.pageSize,
    });

    // Handler returns the INNER paginated shape; runner builds the outer
    // `{ data: { data: ..., pagination: ... } }` envelope.
    return { data: result.data, pagination: result.pagination };
  }),
);
