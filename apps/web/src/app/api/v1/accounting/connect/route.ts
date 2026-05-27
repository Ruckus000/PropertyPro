/**
 * Accounting Connect API
 *
 * POST /api/v1/accounting/connect — initiate a QuickBooks/Xero OAuth
 * connect flow for a community.
 *
 * Plan A1 drain #87. Near-mirror of drain #84 (`accounting/disconnect`):
 * same body schema, same auth chain, same permission gate. The only
 * differences are the HTTP method (`POST` here, `DELETE` there) and the
 * service: `initiateAccountingConnect` takes only 3 args (no requestId),
 * so this handler does NOT forward `x-request-id`.
 *
 * Authorization invariants (preserved verbatim):
 *   requireAuthenticatedUserId
 *   → resolveEffectiveCommunityId(req, body.communityId)
 *   → assertNotDemoGrace(communityId)
 *   → requireCommunityMembership(communityId, actorUserId)
 *   → requireAccountingEnabled(membership)            (SYNC)
 *   → requireAccountingWritePermission(membership)    (SYNC)
 *   → initiateAccountingConnect(communityId, actorUserId, body.provider)
 *
 * The pre-migration handler called `parseCommunityIdFromBody(req, body.communityId)`,
 * which already delegates to `resolveEffectiveCommunityId` under the hood
 * (drain #10 lesson). The only wire delta is the 400 envelope for invalid
 * body, which becomes the canonical `VALIDATION_ERROR` shape; status
 * unchanged at 400.
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
import { initiateAccountingConnect } from '@/lib/services/accounting-connectors-service';
import { accountingConnectContract } from './contract';

export const POST = withErrorHandler(
  runRoute(accountingConnectContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAccountingEnabled(membership);
    requireAccountingWritePermission(membership);

    return initiateAccountingConnect(communityId, actorUserId, body.provider);
  }),
);
