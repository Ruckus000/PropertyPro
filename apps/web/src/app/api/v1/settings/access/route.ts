/**
 * Tenant access to Inspection Reports.
 *
 * GET   /api/v1/settings/access?communityId=N — managers (settings:write)
 * PATCH /api/v1/settings/access               — managers (settings:write)
 *
 * GET also requires settings:write: `settings:read` admits condo/HOA owners,
 * and this card is the manager's alone. Apartments have no tenant-visible
 * inspection reports, so the setting is refused there.
 */
import { runRoute } from '@/lib/api/run-route';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import {
  getCommunityAccessSettings,
  setCommunityAccessSettings,
} from '@/lib/services/community-settings-service';
import { getAccessSettingsContract, patchAccessSettingsContract } from './contract';

export const GET = withErrorHandler(
  runRoute(getAccessSettingsContract, async ({ communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'settings', 'write');
    await requireEntitledForAdminRead(communityId, membership);
    return getCommunityAccessSettings(communityId);
  }),
);

export const PATCH = withErrorHandler(
  runRoute(patchAccessSettingsContract, async ({ body, req, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'settings', 'write');
    await requireActiveSubscriptionForMutation(communityId);

    if (membership.communityType === 'apartment') {
      throw new BadRequestError('Tenant access to inspection reports applies to condo and HOA communities only.');
    }

    const next = { tenantsCanViewInspectionReports: body.tenantsCanViewInspectionReports };
    const previous = await setCommunityAccessSettings(communityId, next);

    await logAuditEvent({
      userId: actorUserId,
      action: 'settings_changed',
      resourceType: 'community',
      resourceId: String(communityId),
      communityId,
      oldValues: { ...previous },
      newValues: { ...next },
      metadata: { requestId: req.headers.get('x-request-id') ?? null },
    });

    return next;
  }),
);
