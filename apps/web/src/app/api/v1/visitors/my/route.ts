/**
 * GET /api/v1/visitors/my
 *
 * Resident-only list of the actor's visitors for a community, with optional
 * filter query (`active` | `upcoming` | `past`). Unknown filters fall back
 * to the default active-passes list.
 *
 * Plan A1 drain #105 — migrated to `runRoute()`; see `./contract.ts`.
 * `passCode` is stripped from every row before response (staff list parity).
 */
import { runRoute } from '@propertypro/api-contract';
import { createScopedClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  isResidentRole,
  requireActorUnitIds,
  requireVisitorLoggingEnabled,
  requireVisitorsReadPermission,
} from '@/lib/logistics/common';
import {
  listMyVisitorsForCommunity,
  listVisitorsForCommunity,
} from '@/lib/services/package-visitor-service';
import { deriveVisitorStatus } from '@/lib/visitors/visitor-logic';
import { visitorsMyContract } from './contract';

/** Strip passCode from resident responses — mirrors GET /visitors */
function stripPassCode<T extends Record<string, unknown>>(rows: T[]) {
  return rows.map(({ passCode: _, ...rest }) => rest);
}

export const GET = withErrorHandler(
  runRoute(visitorsMyContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireVisitorLoggingEnabled(membership);
    requireVisitorsReadPermission(membership);

    if (!isResidentRole(membership.role)) {
      throw new ForbiddenError('Only residents can use the my-visitors view');
    }

    const scoped = createScopedClient(communityId);
    const allowedUnitIds = await requireActorUnitIds(scoped, actorUserId);

    const filter = new URL(req.url).searchParams.get('filter') ?? undefined;

    if (!filter) {
      const data = await listMyVisitorsForCommunity(communityId, actorUserId, allowedUnitIds);
      return stripPassCode(data);
    }

    if (filter === 'active') {
      const rows = await listVisitorsForCommunity(communityId, {
        allowedUnitIds,
        hostUserId: actorUserId,
        status: 'checked_in',
      });
      return stripPassCode(rows);
    }

    if (filter === 'upcoming') {
      const rows = await listVisitorsForCommunity(communityId, {
        allowedUnitIds,
        hostUserId: actorUserId,
        status: 'expected',
      });
      return stripPassCode(rows);
    }

    if (filter === 'past') {
      const rows = await listVisitorsForCommunity(communityId, {
        allowedUnitIds,
        hostUserId: actorUserId,
        onlyActive: false,
      });
      const pastStatuses = new Set(['checked_out', 'expired', 'revoked', 'revoked_on_site']);
      const filtered = rows.filter((row) => pastStatuses.has(deriveVisitorStatus(row)));
      return stripPassCode(filtered);
    }

    const data = await listMyVisitorsForCommunity(communityId, actorUserId, allowedUnitIds);
    return stripPassCode(data);
  }),
);
