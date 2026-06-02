/**
 * Aggregated command-palette search.
 *
 * GET /api/v1/search
 * Query: { q?, limit?, communityId? }
 *
 * Plan A1 auto-drain. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId ?? null)
 *     → requireCommunityMembership
 *     → searchAccessibleGroups(communityId, membership, q, limit)
 *
 * This route has NO `requirePermission` gate — per-group read/feature/admin
 * access is enforced inside `searchAccessibleGroups`.
 *
 * `q` is trimmed and `limit` clamped to [1, 20] (default 3) in-handler,
 * preserving the pre-migration parsing exactly.
 *
 * Envelope migration: the pre-migration handler returned the bare
 * `AggregatedSearchResponse`; the runner wraps it as `{ data: {...} }`. The
 * consumer hook `use-data-search` is updated to unwrap `.data` manually.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { searchAccessibleGroups } from '@/lib/search/data-search-service';
import type { AggregatedSearchResponse } from '@/lib/search/data-search-types';
import { aggregatedSearchContract } from './contract';

export const GET = withErrorHandler(
  runRoute(aggregatedSearchContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId ?? null);
    const membership = await requireCommunityMembership(communityId, userId);

    const q = query.q?.trim() ?? '';
    const limit = Math.min(Math.max(query.limit ?? 3, 1), 20);

    const groups = await searchAccessibleGroups(communityId, membership, q, limit);
    const response: AggregatedSearchResponse = {
      requestId: crypto.randomUUID(),
      communityId,
      partial: groups.some((group) => group.status === 'error'),
      groups,
    };

    return response;
  }),
);
