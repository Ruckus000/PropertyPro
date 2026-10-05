/**
 * Lease settings — Leases v3.
 *
 * GET: any manager (units:write) — the page needs the windows to classify units.
 * PATCH: the ROOT manager only. Alert windows change what every manager sees,
 * and the residents-without-email switch changes who can be put on a lease.
 *
 * Authorization: requireAuthenticatedUserId → (PATCH) assertNotDemoGrace →
 * requireCommunityMembership → apartment gate →
 * requirePermission(membership, 'units', 'write') → (PATCH) root_manager.
 */
import { runRoute } from '@/lib/api/run-route';
import { logAuditEvent } from '@propertypro/db';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { getCommunityLeaseSettings, mergeCommunityLeaseSettings } from '@/lib/services/lease-service';
import { leaseSettingsGetContract, leaseSettingsPatchContract } from './contract';

export const GET = withErrorHandler(
  runRoute(leaseSettingsGetContract, async ({ communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    // Lapsed communities lose admin reads, like the parent leases route.
    await requireEntitledForAdminRead(communityId, membership);
    if (!getFeaturesForCommunity(membership.communityType).hasLeaseTracking) {
      throw new ForbiddenError('Lease tracking is only available for apartment communities');
    }
    requirePermission(membership, 'units', 'write');
    return getCommunityLeaseSettings(communityId);
  }),
);

export const PATCH = withErrorHandler(
  runRoute(leaseSettingsPatchContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    if (!getFeaturesForCommunity(membership.communityType).hasLeaseTracking) {
      throw new ForbiddenError('Lease tracking is only available for apartment communities');
    }
    requirePermission(membership, 'units', 'write');
    if (membership.role !== 'root_manager') {
      throw new ForbiddenError('Only the root manager can change lease settings');
    }

    const patch: { leaseAlertWindows?: number[]; leasesAllowResidentsWithoutEmail?: boolean } = {};
    if (body.alertWindows) {
      const windows = [...new Set(body.alertWindows)].sort((a, b) => a - b);
      if (windows.length !== body.alertWindows.length) {
        throw new ValidationError('Each alert window must be different');
      }
      patch.leaseAlertWindows = windows;
    }
    if (body.allowResidentsWithoutEmail !== undefined) {
      patch.leasesAllowResidentsWithoutEmail = body.allowResidentsWithoutEmail;
    }
    if (Object.keys(patch).length === 0) throw new ValidationError('No settings to update');

    const before = await getCommunityLeaseSettings(communityId);
    await mergeCommunityLeaseSettings(communityId, patch);
    const after = await getCommunityLeaseSettings(communityId);

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'community_lease_settings',
      resourceId: String(communityId),
      communityId,
      oldValues: before as unknown as Record<string, unknown>,
      newValues: after as unknown as Record<string, unknown>,
    });
    return after;
  }),
);
