/**
 * Elections — cancel an election (state transition)
 *
 * POST /api/v1/elections/[id]/cancel
 * Body: { communityId, canceledReason }
 *
 * Plan A1 drain #45. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Sibling precedent: drain
 * #42 (`POST /api/v1/elections/[id]/open`, PR #446). Auth chain preserved
 * verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireElectionsEnabled (sync, NOT awaited)
 *     → requirePermission('elections', 'write')
 *     → requireElectionsAdminRole
 *     → cancelElectionForCommunity(communityId, electionId, actorUserId,
 *         { canceledReason }, x-request-id)
 *
 * Service signature preserves the SEPARATE object arg `{ canceledReason }`
 * (verbatim from pre-migration handler — NOT flattened into positional args).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status unchanged. Success wire shape `{ data: ... }` byte-identical.
 *
 * `x-request-id` header forwarded verbatim to `cancelElectionForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireElectionsAdminRole, requireElectionsEnabled } from '@/lib/elections/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { cancelElectionForCommunity } from '@/lib/services/elections-service';
import { requirePermission } from '@/lib/db/access-control';
import { electionsCancelContract } from './contract';

export const POST = withErrorHandler(
  runRoute(electionsCancelContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requirePermission(membership, 'elections', 'write');
    requireElectionsAdminRole(membership);

    return cancelElectionForCommunity(
      communityId,
      params.id,
      actorUserId,
      { canceledReason: body.canceledReason },
      req.headers.get('x-request-id'),
    );
  }),
);
