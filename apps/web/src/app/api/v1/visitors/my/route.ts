/**
 * GET /api/v1/visitors/my
 *
 * Resident-only list of the actor's visitors for a community, with optional
 * filter query (`active` | `upcoming` | `past`). Unknown filters fall back
 * to the default active-passes list.
 *
 * Contract: `./contract.ts`.
 *
 * `passCode` is the credential staff check at the gate, so it is returned only
 * on rows the actor registered (`hostUserId === actorUserId`) — the host needs
 * it to show the QR and share the pass. Every other row (a co-resident's pass
 * on the same unit, returned by the default branch) has it stripped.
 */
import { runRoute } from '@propertypro/api-contract';
import { createScopedClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
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

/** Keep `passCode` only on the actor's own passes; strip it from every other row. */
function withHostOnlyPassCode<T extends { hostUserId: string | null; passCode: string }>(
  rows: T[],
  actorUserId: string,
) {
  return rows.map((row) => {
    if (row.hostUserId === actorUserId) return row;
    const { passCode: _, ...rest } = row;
    return rest;
  });
}

export const GET = withErrorHandler(
  runRoute(visitorsMyContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireVisitorLoggingEnabled(membership);
    requireVisitorsReadPermission(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    if (!isResidentRole(membership.role)) {
      throw new ForbiddenError('Only residents can use the my-visitors view');
    }

    const scoped = createScopedClient(communityId);
    const allowedUnitIds = await requireActorUnitIds(scoped, actorUserId);

    const filter = new URL(req.url).searchParams.get('filter') ?? undefined;

    if (!filter) {
      const data = await listMyVisitorsForCommunity(communityId, actorUserId, allowedUnitIds);
      return withHostOnlyPassCode(data, actorUserId);
    }

    if (filter === 'active') {
      const rows = await listVisitorsForCommunity(communityId, {
        allowedUnitIds,
        hostUserId: actorUserId,
        status: 'checked_in',
      });
      return withHostOnlyPassCode(rows, actorUserId);
    }

    if (filter === 'upcoming') {
      const rows = await listVisitorsForCommunity(communityId, {
        allowedUnitIds,
        hostUserId: actorUserId,
        status: 'expected',
      });
      return withHostOnlyPassCode(rows, actorUserId);
    }

    if (filter === 'past') {
      const rows = await listVisitorsForCommunity(communityId, {
        allowedUnitIds,
        hostUserId: actorUserId,
        onlyActive: false,
      });
      const pastStatuses = new Set(['checked_out', 'expired', 'revoked', 'revoked_on_site']);
      const filtered = rows.filter((row) => pastStatuses.has(deriveVisitorStatus(row)));
      return withHostOnlyPassCode(filtered, actorUserId);
    }

    const data = await listMyVisitorsForCommunity(communityId, actorUserId, allowedUnitIds);
    return withHostOnlyPassCode(data, actorUserId);
  }),
);
