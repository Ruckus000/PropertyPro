/**
 * Snowbird digest board toggle — enable/disable the digest for a community.
 *
 * Admin-tier only (settings:write). When enabled, owners receive the digest by
 * default (absence of a subscription row = weekly) until they opt out.
 */
import { createScopedClient, logAuditEvent } from '@propertypro/db';
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { setCommunitySnowbirdEnabled } from '@/lib/services/snowbird-digest-subscription-service';
import { snowbirdCommunityToggleContract } from '../contract';

export const PATCH = withErrorHandler(
  runRoute(snowbirdCommunityToggleContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'settings', 'write');
    await requireActiveSubscriptionForMutation(communityId);

    const scoped = createScopedClient(communityId);
    await setCommunitySnowbirdEnabled(scoped, body.enabled);

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'snowbird_digest_settings',
      resourceId: String(communityId),
      communityId,
      newValues: { snowbirdDigestEnabled: body.enabled },
    });

    return { enabled: body.enabled };
  }),
);
