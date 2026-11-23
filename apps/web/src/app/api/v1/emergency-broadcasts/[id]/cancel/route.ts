/**
 * Emergency Broadcast cancel API — cancel a draft or immediate broadcast any
 * time before its send starts, or a scheduled one any time before the
 * scheduled-emergency-broadcasts cron claims it. There is no server-side time
 * window: the composer's 10-second countdown is a pause in the browser. A
 * cancel that loses to a send is a 409 `CONFLICT`; so is one on an alert
 * already canceled or sent (thrown by the service); an unknown id is a 404.
 *
 * POST /api/v1/emergency-broadcasts/[id]/cancel
 * Body: { communityId }
 *
 * Plan A1 drain #71. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schema, B1 normalizations, and rationale.
 *
 * Two B1 cleanups vs. pre-migration:
 *   1. Inline 409 `{error: 'Undo window has expired...'}` → `ConflictError`.
 *      Message preserved byte-identical; envelope shifts to canonical
 *      `{error: {code: 'CONFLICT', ...}}`.
 *   2. Top-level `{canceled: true}` success envelope wrapped to
 *      `{data: {canceled: true}}` by the runner.
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requirePermission('emergency_broadcasts', 'write')
 *     → cancelBroadcast(broadcastId, communityId, userId)  // id FIRST
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { ConflictError } from '@/lib/api/errors';
import { cancelBroadcast } from '@/lib/services/emergency-broadcast-service';
import { emergencyBroadcastsCancelContract } from './contract';

export const POST = withErrorHandler(
  runRoute(emergencyBroadcastsCancelContract, async ({ params, body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'emergency_broadcasts', 'write');

    const canceled = await cancelBroadcast(params.id, communityId, userId);
    if (!canceled) {
      throw new ConflictError(
        'This alert can no longer be canceled: it has already started sending.',
      );
    }

    return { canceled: true as const };
  }),
);
