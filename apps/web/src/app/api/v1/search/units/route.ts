/**
 * GET /api/v1/search/units — staff unit label search.
 *
 * Plan A1 drain #161. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { requireStaffOperator } from '@/lib/logistics/common';
import { searchUnitsByLabel } from '@/lib/services/units-lookup';
import { searchUnitsContract } from './contract';

export const GET = withErrorHandler(
  runRoute(searchUnitsContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requireStaffOperator(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const q = query.q?.trim() ?? '';
    const limit = Math.min(Math.max(query.limit ?? 10, 1), 20);

    if (q.length < 1) {
      return { results: [] };
    }

    const results = await searchUnitsByLabel(communityId, q, limit);
    return {
      results: results.map((r) => ({
        id: r.id,
        label: r.unitNumber,
        building: r.building,
        floor: r.floor,
      })),
    };
  }),
);
