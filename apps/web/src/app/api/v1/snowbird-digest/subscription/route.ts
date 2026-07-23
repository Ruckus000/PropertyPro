/**
 * Snowbird digest self-service subscription — the caller's own cadence.
 *
 * GET returns the effective cadence (row or the weekly default) + whether the
 * board enabled the digest for this community. PATCH sets the caller's OWN
 * cadence — the handler forces the row to the authenticated user, so a target
 * user id can never be supplied.
 */
import { createScopedClient } from '@propertypro/db';
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  getCommunitySnowbirdEnabled,
  getOwnSubscription,
  resolveEffectiveCadence,
  setOwnCadence,
} from '@/lib/services/snowbird-digest-subscription-service';
import { snowbirdGetContract, snowbirdPatchContract } from '../contract';

export const GET = withErrorHandler(
  runRoute(snowbirdGetContract, async ({ communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'settings', 'read');
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const scoped = createScopedClient(communityId);
    const [row, enabled] = await Promise.all([
      getOwnSubscription(scoped, actorUserId),
      getCommunitySnowbirdEnabled(scoped),
    ]);

    return { cadence: resolveEffectiveCadence(row), communityEnabled: enabled };
  }),
);

export const PATCH = withErrorHandler(
  runRoute(snowbirdPatchContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'settings', 'read');

    const scoped = createScopedClient(communityId);
    // Self-service: the row is always the authenticated user's.
    await setOwnCadence(scoped, communityId, actorUserId, body.cadence);

    return { cadence: body.cadence };
  }),
);
