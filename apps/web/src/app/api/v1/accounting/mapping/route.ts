/**
 * Accounting Mapping API
 *
 * GET /api/v1/accounting/mapping — read the current category→external-account
 *   mapping for a community's QuickBooks/Xero connection, plus the
 *   discoverable account list from the upstream adapter.
 * PUT /api/v1/accounting/mapping — replace the mapping for the community's
 *   connection.
 *
 * Plan A1 drain #88. Behavior-preserving migration to `runRoute`. Auth
 * chains preserved verbatim:
 *
 *   GET:
 *     requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership(communityId, actorUserId)
 *     → requireAccountingEnabled(membership)            (SYNC)
 *     → requireAccountingReadPermission(membership)     (SYNC)
 *     → getAccountingMapping(communityId, query.provider)
 *
 *   PUT:
 *     requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace(communityId)
 *     → requireCommunityMembership(communityId, actorUserId)
 *     → requireAccountingEnabled(membership)            (SYNC)
 *     → requireAccountingWritePermission(membership)    (SYNC)
 *     → updateAccountingMapping(communityId, actorUserId, body.provider,
 *                               body.mapping, x-request-id ?? null)
 *
 * `parseCommunityIdFromQuery(req)` / `parseCommunityIdFromBody(req, ...)`
 * already delegated to `resolveEffectiveCommunityId(...)` under the hood
 * (drain #10 lesson); the explicit call here preserves header-vs-payload
 * precedence semantics. Success wire shape `{ data: ... }` byte-identical.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  requireAccountingEnabled,
  requireAccountingReadPermission,
  requireAccountingWritePermission,
} from '@/lib/accounting/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import {
  getAccountingMapping,
  updateAccountingMapping,
} from '@/lib/services/accounting-connectors-service';
import {
  accountingMappingGetContract,
  accountingMappingPutContract,
} from './contract';

export const GET = withErrorHandler(
  runRoute(accountingMappingGetContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAccountingEnabled(membership);
    requireAccountingReadPermission(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    return getAccountingMapping(communityId, query.provider);
  }),
);

export const PUT = withErrorHandler(
  runRoute(accountingMappingPutContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAccountingEnabled(membership);
    requireAccountingWritePermission(membership);

    return updateAccountingMapping(
      communityId,
      actorUserId,
      body.provider,
      body.mapping,
      req.headers.get('x-request-id'),
    );
  }),
);
