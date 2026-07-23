/**
 * Elections collection API — list elections for a community.
 *
 * Plan A1 drain #137. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and auth-chain rationale.
 */
import { runRoute } from '@propertypro/api-contract';
import type { ElectionStatus } from '@propertypro/db';
import type { NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { requireElectionsEnabled } from '@/lib/elections/common';
import { listElectionsForCommunity } from '@/lib/services/elections-service';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { requirePermission } from '@/lib/db/access-control';
import { electionsListContract } from './contract';

function parseStatusesFilter(raw: string | null): ElectionStatus[] | undefined {
  if (!raw) {
    return undefined;
  }

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean) as ElectionStatus[];
}

export const GET = withErrorHandler(
  runRoute(electionsListContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req as NextRequest);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requirePermission(membership, 'elections', 'read');
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const statuses = parseStatusesFilter(new URL(req.url).searchParams.get('statuses'));

    return listElectionsForCommunity(communityId, {
      limit: query.limit,
      statuses,
    });
  }),
);
