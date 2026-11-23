/**
 * Schedule a drafted emergency alert to send later.
 *
 * POST /api/v1/emergency-broadcasts/[id]/schedule
 * Body: { communityId, scheduledFor }
 *
 * Converts the draft in place; see `./contract.ts` and `scheduleBroadcast`.
 * Like the other emergency routes it does not check the subscription
 * (life-safety over revenue).
 */
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { scheduleBroadcast } from '@/lib/services/emergency-broadcast-service';
import { emergencyBroadcastsScheduleContract } from './contract';

export const POST = withErrorHandler(
  runRoute(emergencyBroadcastsScheduleContract, async ({ params, body, communityId }) => {
    const userId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'emergency_broadcasts', 'write');

    return scheduleBroadcast(params.id, communityId, userId, new Date(body.scheduledFor));
  }),
);
