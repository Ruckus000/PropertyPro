/**
 * Accounting Disconnect API
 *
 * DELETE /api/v1/accounting/disconnect — revoke an active QuickBooks/Xero
 * connection for a community.
 *
 * Plan A1 drain #84. Second `DELETE` handler in the contract corpus
 * (after drain #22 `esign/consent`); first DELETE with a body schema.
 * See `./contract.ts` for the schema and permission rationale.
 *
 * Authorization invariants (preserved verbatim):
 *   requireAuthenticatedUserId
 *   → resolveEffectiveCommunityId(req, body.communityId)
 *   → assertNotDemoGrace(communityId)
 *   → requireCommunityMembership(communityId, actorUserId)
 *   → requireAccountingEnabled(membership)            (SYNC)
 *   → requireAccountingWritePermission(membership)    (SYNC)
 *   → disconnectAccounting(communityId, actorUserId, body.provider, requestId)
 *
 * The pre-migration handler called `parseCommunityIdFromBody(req, body.communityId)`,
 * which already delegates to `resolveEffectiveCommunityId` under the hood
 * (drain #10 lesson). The only wire delta is the 400 envelope for invalid
 * body, which becomes the canonical `VALIDATION_ERROR` shape; status
 * unchanged at 400.
 *
 * `requestId = req.headers.get('x-request-id')` is forwarded verbatim,
 * including the `null` value when absent.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  requireAccountingEnabled,
  requireAccountingWritePermission,
} from '@/lib/accounting/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { disconnectAccounting } from '@/lib/services/accounting-connectors-service';
import { accountingDisconnectContract } from './contract';

export const DELETE = withErrorHandler(
  runRoute(accountingDisconnectContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAccountingEnabled(membership);
    requireAccountingWritePermission(membership);

    const requestId = req.headers.get('x-request-id');
    return disconnectAccounting(communityId, actorUserId, body.provider, requestId);
  }),
);
