/**
 * GET /api/v1/packages/my
 *
 * Resident-only list of not-yet-picked-up packages for the actor's accessible
 * units within a community. Returns `{ data: PackageListItem[] }` (wire shape
 * unchanged across this migration).
 *
 * Plan A1 drain #10. Input validation (query) and output validation +
 * canonical envelope wrapping are delegated to `runRoute()` from
 * `@propertypro/api-contract`.
 *
 * Cleanup vs. the previous implementation: replaced
 * `parseCommunityIdFromQuery(req)` with the canonical
 * `resolveEffectiveCommunityId(req, query.communityId)` reconciler.
 *
 * Behavior changes:
 *   - 400 body shape for malformed/missing query now uses the runner's
 *     `VALIDATION_ERROR` envelope (was a hand-constructed `BadRequestError`).
 *     Status code unchanged (still 400).
 *   - Header/query `communityId` mismatch was ALREADY 404 pre-migration —
 *     `parseCommunityIdFromQuery` itself delegated to
 *     `resolveEffectiveCommunityId` after parsing, so this drain does NOT
 *     introduce a 400 → 404 status change for that path. The 404 regression
 *     test in `my-route.test.ts` is locking in pre-existing behavior, not
 *     a migration delta.
 *
 * Multi-gate auth chain preserved verbatim, in order:
 *   `requireAuthenticatedUserId`
 *     → `resolveEffectiveCommunityId` (replaces `parseCommunityIdFromQuery`)
 *     → `requireCommunityMembership`
 *     → `requirePackageLoggingEnabled` (feature-flag gate)
 *     → `requirePackagesReadPermission` (RBAC gate)
 *     → `isResidentRole` check (literal 403 message preserved:
 *        'Only residents can use the my-packages view')
 *     → `createScopedClient` + `requireActorUnitIds`
 *     → `listMyPackagesForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { createScopedClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { ForbiddenError } from '@/lib/api/errors';
import {
  isResidentRole,
  requireActorUnitIds,
  requirePackageLoggingEnabled,
  requirePackagesReadPermission,
} from '@/lib/logistics/common';
import { listMyPackagesForCommunity } from '@/lib/services/package-visitor-service';
import { packagesMyContract } from './contract';

export const GET = withErrorHandler(
  runRoute(packagesMyContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requirePackageLoggingEnabled(membership);
    requirePackagesReadPermission(membership);

    if (!isResidentRole(membership.role)) {
      throw new ForbiddenError('Only residents can use the my-packages view');
    }

    const scoped = createScopedClient(communityId);
    const allowedUnitIds = await requireActorUnitIds(scoped, actorUserId);
    return await listMyPackagesForCommunity(communityId, allowedUnitIds);
  }),
);
