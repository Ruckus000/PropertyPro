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
 * `q` is trimmed in-handler. `limit` is range-validated by the contract
 * schema (`min(1).max(20)`); the handler only applies the default of 3.
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
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { searchAccessibleGroups } from '@/lib/search/data-search-service';
import type { AggregatedSearchResponse } from '@/lib/search/data-search-types';
import { aggregatedSearchContract } from './contract';

export const GET = withErrorHandler(
  runRoute(aggregatedSearchContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId ?? null);
    const membership = await requireCommunityMembership(communityId, userId);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const q = query.q?.trim() ?? '';
    // Range validation lives in the contract schema (`min(1).max(20)`); the
    // handler only supplies the default. Avoid dual-validation (contract OR
    // handler, never both).
    const limit = query.limit ?? 3;

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
