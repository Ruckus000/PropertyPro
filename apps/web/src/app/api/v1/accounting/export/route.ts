/**
 * Accounting Export API
 *
 * POST /api/v1/accounting/export — export ledger entries to QuickBooks/Xero.
 *
 * Plan A1 drain #170. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 *
 * Authorization invariants (preserved verbatim):
 *   requireAuthenticatedUserId
 *   → resolveEffectiveCommunityId(req, body.communityId)
 *   → requireCommunityMembership(communityId, actorUserId)
 *   → requireAccountingEnabled(membership)            (SYNC)
 *   → requireAccountingWritePermission(membership)    (SYNC)
 *   → exportLedgerToAccounting(..., requestId)
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
import { exportLedgerToAccounting } from '@/lib/services/accounting-connectors-service';
import { accountingExportContract } from './contract';

export const POST = withErrorHandler(
  runRoute(accountingExportContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAccountingEnabled(membership);
    requireAccountingWritePermission(membership);

    const requestId = req.headers.get('x-request-id');
    return exportLedgerToAccounting(
      communityId,
      actorUserId,
      body.provider,
      {
        startDate: body.startDate,
        endDate: body.endDate,
        limit: body.limit,
      },
      requestId,
    );
  }),
);
