/**
 * Violations — resolve a violation (admin-facing).
 *
 * POST /api/v1/violations/[id]/resolve
 * Body: { communityId, resolutionNotes? }
 *
 * Plan A1 drain #52. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireViolationsEnabled (ASYNC — awaited)
 *     → requirePermission('violations', 'write')
 *     → requireViolationAdminWrite (sync, isAdmin gate)
 *     → resolveViolationForCommunity(communityId, violationId, actorUserId,
 *         sanitizedNotes, x-request-id)
 *
 * HTML sanitization (`sanitizeHtml`) is preserved INSIDE the handler
 * (post-Zod validation, pre-service-call). The `!= null` conditional matches
 * the pre-migration behavior: undefined/null notes flow through as `null` to
 * the service; non-null strings are sanitized first. This mirrors drain #2's
 * precedent for free-form note fields.
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status unchanged. Success wire shape `{ data: ... }` byte-identical.
 *
 * `x-request-id` header forwarded verbatim to `resolveViolationForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireViolationAdminWrite, requireViolationsEnabled } from '@/lib/violations/common';
import { resolveViolationForCommunity } from '@/lib/services/violations-service';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';
import { requirePermission } from '@/lib/db/access-control';
import { violationsResolveContract } from './contract';

export const POST = withErrorHandler(
  runRoute(violationsResolveContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireViolationsEnabled(membership);
    requirePermission(membership, 'violations', 'write');
    requireViolationAdminWrite(membership);

    const sanitizedNotes =
      body.resolutionNotes != null ? sanitizeHtml(body.resolutionNotes) : null;

    return resolveViolationForCommunity(
      communityId,
      params.id,
      actorUserId,
      sanitizedNotes,
      req.headers.get('x-request-id'),
    );
  }),
);
