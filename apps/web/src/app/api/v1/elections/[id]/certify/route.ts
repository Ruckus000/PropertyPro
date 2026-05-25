/**
 * Elections — certify an election (state transition)
 *
 * POST /api/v1/elections/[id]/certify
 * Body: { communityId, resultsDocumentId? }
 *
 * Plan A1 drain #46. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Auth chain preserved
 * verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireElectionsEnabled (sync, NOT awaited)
 *     → requirePermission('elections', 'write')
 *     → requireElectionsAdminRole
 *     → certifyElectionForCommunity(communityId, electionId, actorUserId,
 *         { resultsDocumentId }, x-request-id)
 *
 * The `?? null` coercion on `resultsDocumentId` is preserved verbatim — it
 * normalizes both `undefined` (omitted) and `null` (explicit) to `null`
 * before the service object arg `{ resultsDocumentId }` is constructed.
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status unchanged. Success wire shape `{ data: ... }` byte-identical.
 *
 * `x-request-id` header forwarded verbatim to `certifyElectionForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireElectionsAdminRole, requireElectionsEnabled } from '@/lib/elections/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { certifyElectionForCommunity } from '@/lib/services/elections-service';
import { requirePermission } from '@/lib/db/access-control';
import { electionsCertifyContract } from './contract';

export const POST = withErrorHandler(
  runRoute(electionsCertifyContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requirePermission(membership, 'elections', 'write');
    requireElectionsAdminRole(membership);

    return certifyElectionForCommunity(
      communityId,
      params.id,
      actorUserId,
      { resultsDocumentId: body.resultsDocumentId ?? null },
      req.headers.get('x-request-id'),
    );
  }),
);
