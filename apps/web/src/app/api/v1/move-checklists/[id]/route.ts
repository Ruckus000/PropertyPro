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
 * Authorization chain (current; see "Later change" below for what moved):
 *   GET  — param/query Zod + tenantScope resolution (runner)
 *          → `requireAuthenticatedUserId`
 *          → `requireCommunityMembership` → `isAdminRole` → `getMoveChecklist`
 *          → 404 on null.
 *   POST — param Zod / body Zod + tenantScope resolution (runner)
 *          → `requireAuthenticatedUserId` → `assertNotDemoGrace`
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
 *
 * Later change (tenant cross-check): both contracts declare `tenantScope`
 * (GET `in: 'query'`, POST `in: 'body'`), so the app-bound runner reconciles
 * `communityId` against the middleware `x-community-id` header and injects it.
 * A header/explicit mismatch is now 404, returned before the 401 (the runner
 * resolves before the handler runs). POST also gained `assertNotDemoGrace`,
 * matching its sibling writes (collection POST, step PATCH): a demo community
 * in its grace period now gets 403 `DEMO_GRACE_READ_ONLY` before membership.
 */
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { isAdminRole } from '@propertypro/shared';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { getMoveChecklist, completeChecklist } from '@/lib/services/move-checklist-service';
import { getMoveChecklistContract, completeMoveChecklistContract } from './contract';

export const GET = withErrorHandler(
  runRoute(getMoveChecklistContract, async ({ params, communityId }) => {
    const userId = await requireAuthenticatedUserId();
    const checklistId = params.id;

    const membership = await requireCommunityMembership(communityId, userId);
    if (!isAdminRole(membership.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const checklist = await getMoveChecklist(communityId, checklistId);
    if (!checklist) {
      throw new NotFoundError('Checklist not found');
    }

    return checklist;
  }),
);

export const POST = withErrorHandler(
  runRoute(completeMoveChecklistContract, async ({ params, communityId }) => {
    const userId = await requireAuthenticatedUserId();
    const checklistId = params.id;

    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    if (!isAdminRole(membership.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }

    const completed = await completeChecklist(communityId, checklistId, userId);
    return completed;
  }),
);
