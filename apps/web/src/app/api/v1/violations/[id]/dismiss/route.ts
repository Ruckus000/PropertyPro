/**
 * Violations — dismiss a violation (admin-facing).
 *
 * POST /api/v1/violations/[id]/dismiss
 * Body: { communityId, resolutionNotes? }
 *
 * Plan A1 drain #65. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireViolationsEnabled (ASYNC — awaited)
 *     → requirePermission('violations', 'write')
 *     → requireViolationAdminWrite (sync, isAdmin gate)
 *     → dismissViolationForCommunity(communityId, violationId, actorUserId,
 *         resolutionNotes ?? null, x-request-id)
 *
 * IMPORTANT — no HTML sanitization here. Unlike the sibling `/resolve` route
 * (drain #52) which calls `sanitizeHtml(resolutionNotes)` before the service
 * call, this dismiss handler passes `resolutionNotes` RAW (with `?? null`
 * coercion). This matches the pre-migration behavior verbatim.
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status unchanged. Success wire shape `{ data: ... }` byte-identical.
 *
 * `x-request-id` header forwarded verbatim to `dismissViolationForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireViolationAdminWrite, requireViolationsEnabled } from '@/lib/violations/common';
import { dismissViolationForCommunity } from '@/lib/services/violations-service';
import { requirePermission } from '@/lib/db/access-control';
import { violationsDismissContract } from './contract';

export const POST = withErrorHandler(
  runRoute(violationsDismissContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireViolationsEnabled(membership);
    requirePermission(membership, 'violations', 'write');
    requireViolationAdminWrite(membership);

    return dismissViolationForCommunity(
      communityId,
      params.id,
      actorUserId,
      body.resolutionNotes ?? null,
      req.headers.get('x-request-id'),
    );
  }),
);
