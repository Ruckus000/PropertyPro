/**
 * Visitors — denied-visitor match (staff-operator read).
 *
 * GET /api/v1/visitors/denied/match
 * Query: { communityId, name?, plate? }
 *
 * Plan A1 drain #85. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Auth chain preserved
 * verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requireVisitorLoggingEnabled  (ASYNC — awaited)
 *     → requireVisitorsReadPermission (sync)
 *     → requireStaffOperator           (sync)
 *     → matchDeniedVisitors(communityId, name ?? null, plate ?? null)
 *
 * Behavior change vs. pre-migration: missing/invalid `communityId` query
 * shifts from `BadRequestError` to the canonical 400 `VALIDATION_ERROR`
 * envelope. Status code unchanged. Success wire shape `{ data: ... }`
 * byte-identical.
 *
 * `searchParams.get('name' | 'plate')` returned `string | null`. Zod
 * `.optional()` yields `string | undefined`; the handler converts
 * `undefined` → `null` to preserve the service signature.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  requireStaffOperator,
  requireVisitorLoggingEnabled,
  requireVisitorsReadPermission,
} from '@/lib/logistics/common';
import { matchDeniedVisitors } from '@/lib/services/package-visitor-service';
import { visitorsDeniedMatchContract } from './contract';

export const GET = withErrorHandler(
  runRoute(visitorsDeniedMatchContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireVisitorLoggingEnabled(membership);
    requireVisitorsReadPermission(membership);
    requireStaffOperator(membership);

    return matchDeniedVisitors(communityId, query.name ?? null, query.plate ?? null);
  }),
);
