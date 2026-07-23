/**
 * Emergency Broadcast detail API — get broadcast with delivery report.
 *
 * GET /api/v1/emergency-broadcasts/[id] — Get broadcast + delivery report
 *
 * Plan A1 drain #115 — migrated to `runRoute(contract, handler)`;
 * see `./contract.ts` for schemas and auth-chain rationale.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { NotFoundError } from '@/lib/api/errors/NotFoundError';
import { getBroadcastWithReport } from '@/lib/services/emergency-broadcast-service';
import { emergencyBroadcastDetailContract } from './contract';

export const GET = withErrorHandler(
  runRoute(emergencyBroadcastDetailContract, async ({ params, query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'emergency_broadcasts', 'read');
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const report = await getBroadcastWithReport(params.id, communityId);
    if (!report) {
      throw new NotFoundError('Broadcast not found');
    }

    return report;
  }),
);
