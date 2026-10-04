/**
 * Unit offline / back online — Leases v3 (E7).
 *
 * A unit can go offline only when nobody lives there and nobody is booked in:
 * no current or upcoming active lease. An offline unit is left out of vacancy,
 * occupancy, New lease and Transfer (createLease refuses it).
 *
 * Authorization: requireAuthenticatedUserId → assertNotDemoGrace →
 * requireCommunityMembership → apartment gate →
 * requirePermission(membership, 'units', 'write').
 */
import { runRoute } from '@/lib/api/run-route';
import { logAuditEvent } from '@propertypro/db';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { utcDateToWallClockValue } from '@/lib/utils/zoned-datetime';
import { effectiveEndDate } from '@/lib/leases/lease-rules';
import { getUnitLeaseDefaults, listLeasesForCommunity, setUnitOffline } from '@/lib/services/lease-service';
import { leaseUnitStatusPatchContract } from './contract';

export const PATCH = withErrorHandler(
  runRoute(leaseUnitStatusPatchContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    if (!getFeaturesForCommunity(membership.communityType).hasLeaseTracking) {
      throw new ForbiddenError('Lease tracking is only available for apartment communities');
    }
    requirePermission(membership, 'units', 'write');

    const unit = await getUnitLeaseDefaults(communityId, body.unitId);
    if (!unit) throw new NotFoundError('Unit not found in this community');

    if (body.offline) {
      if (body.offline.until && body.offline.until < body.offline.since) {
        throw new ValidationError('The expected return date cannot be before the offline date');
      }
      const today = utcDateToWallClockValue(new Date(), membership.timezone ?? 'America/New_York').slice(0, 10);
      const { rows: unitLeaseRows } = await listLeasesForCommunity(communityId, { unitId: body.unitId });
      const leases = unitLeaseRows as unknown as Array<{
        id: number; unitId: number; status: string; startDate: string; endDate: string | null; moveOutOn: string | null;
      }>;
      const occupiedOrBooked = leases.find((l) => {
        if (l.unitId !== body.unitId || l.status !== 'active') return false;
        const lastDay = effectiveEndDate(l);
        return !lastDay || lastDay >= today;
      });
      if (occupiedOrBooked) {
        throw new ConflictError('This unit has a current or upcoming lease. It can go offline once it is empty.', {
          leaseId: occupiedOrBooked.id,
        });
      }
    }

    const values = body.offline
      ? {
          offlineReason: body.offline.reason,
          offlineNote: body.offline.note ?? null,
          offlineSince: body.offline.since,
          offlineUntil: body.offline.until ?? null,
        }
      : { offlineReason: null, offlineNote: null, offlineSince: null, offlineUntil: null };
    const updated = await setUnitOffline(communityId, body.unitId, values);

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'unit',
      resourceId: String(body.unitId),
      communityId,
      oldValues: { offlineSince: unit['offlineSince'] ?? null },
      newValues: values,
    });
    return updated;
  }),
);
