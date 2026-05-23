/**
 * Move Checklist API — single resource.
 *
 * GET  /api/v1/move-checklists/[id]?communityId=N  — fetch one checklist
 * POST /api/v1/move-checklists/[id]                — mark a checklist complete
 *
 * Plan A1 drain #19. Two contracts in one file (GET + POST) migrated to the
 * `runRoute()` pattern from `@propertypro/api-contract`. Mirrors drain #13
 * (payments/fee-policy) for the dual-contract shape; mirrors drain #11
 * (polls/[id]/my-vote) for the params+query plumbing.
 *
 * Authorization invariants (preserved verbatim from pre-migration):
 *   GET  — `requireAuthenticatedUserId` → param/query Zod (runner)
 *          → `requireCommunityMembership` → `isAdminRole` → `getMoveChecklist`
 *          → 404 on null.
 *   POST — `requireAuthenticatedUserId` → param Zod / body Zod (runner)
 *          → `requireCommunityMembership` → `isAdminRole` → `completeChecklist`.
 *
 * Behavior changes vs. pre-migration:
 *   - GET/POST: invalid path / query / body 400 envelopes now carry the
 *     runner's canonical `VALIDATION_ERROR` shape (was hand-constructed
 *     `ValidationError` with a single message, or `formatZodErrors` per-field
 *     payload on POST body). Status codes unchanged.
 *   - The pre-migration POST body validation used `formatZodErrors` — that
 *     code path is gone here. No other route uses this route's
 *     `completeChecklistSchema`, so removing it is safe.
 *   - No header/query reconciliation in this route — the handler reads
 *     `communityId` directly from query / body and does NOT call
 *     `resolveEffectiveCommunityId`. Behavior unchanged.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { isAdminRole } from '@propertypro/shared';
import { getMoveChecklist, completeChecklist } from '@/lib/services/move-checklist-service';
import { getMoveChecklistContract, completeMoveChecklistContract } from './contract';

export const GET = withErrorHandler(
  runRoute(getMoveChecklistContract, async ({ params, query }) => {
    const userId = await requireAuthenticatedUserId();
    const checklistId = params.id;
    const communityId = query.communityId;

    const membership = await requireCommunityMembership(communityId, userId);
    if (!isAdminRole(membership.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }

    const checklist = await getMoveChecklist(communityId, checklistId);
    if (!checklist) {
      throw new NotFoundError('Checklist not found');
    }

    return checklist;
  }),
);

export const POST = withErrorHandler(
  runRoute(completeMoveChecklistContract, async ({ params, body }) => {
    const userId = await requireAuthenticatedUserId();
    const checklistId = params.id;
    const communityId = body.communityId;

    const membership = await requireCommunityMembership(communityId, userId);
    if (!isAdminRole(membership.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }

    const completed = await completeChecklist(communityId, checklistId, userId);
    return completed;
  }),
);
