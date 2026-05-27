/**
 * Emergency Broadcast send API — confirm + execute broadcast.
 *
 * POST /api/v1/emergency-broadcasts/[id]/send
 * Body: { communityId }
 *
 * Plan A1 drain #76. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schema, B1-style envelope normalization, and rationale.
 *
 * B1-style envelope migration vs. pre-migration: flat `NextResponse.json(result)`
 * is replaced with `return result` — the runner wraps into canonical
 * `{data: <result>}`. Pre-existing integration test swept in the same change.
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requirePermission('emergency_broadcasts', 'write')
 *     → executeBroadcast(broadcastId, communityId, userId)  // id FIRST
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { executeBroadcast } from '@/lib/services/emergency-broadcast-service';
import { emergencyBroadcastsSendContract } from './contract';

export const POST = withErrorHandler(
  runRoute(emergencyBroadcastsSendContract, async ({ params, body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'emergency_broadcasts', 'write');

    return executeBroadcast(params.id, communityId, userId);
  }),
);
