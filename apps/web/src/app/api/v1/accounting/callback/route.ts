/**
 * Accounting OAuth Callback API
 *
 * GET /api/v1/accounting/callback — completes a QuickBooks/Xero OAuth
 * connect flow for a community after the user authorizes at the provider.
 *
 * Plan A1 drain #91. See `./contract.ts` for the full contract docblock
 * (auth chain, sequencing nuance, response shape rationale).
 *
 * Authorization chain (preserved verbatim):
 *   requireAuthenticatedUserId
 *   → resolveEffectiveCommunityId(req, query.communityId)
 *   → requireCommunityMembership(communityId, actorUserId)
 *   → requireAccountingEnabled(membership)            (SYNC)
 *   → requireAccountingWritePermission(membership)    (SYNC)
 *   → validateAccountingOAuthState(state, communityId, actorUserId, provider) (SYNC, throws)
 *   → completeAccountingConnect(communityId, actorUserId, provider, code, x-request-id)
 *
 * `parseCommunityIdFromQuery(req)` (pre-migration) already delegated to
 * `resolveEffectiveCommunityId` (drain #10 lesson), so the swap is wire-
 * preserving for tenant resolution. `state` and `code` `min(1)` Zod
 * refinements pre-empt the null-state branch inside
 * `validateAccountingOAuthState` and the inline empty-code BadRequest
 * branch — both become unreachable post-migration. Wire shape is
 * byte-identical at `{ data: <service-result> }`.
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
import {
  completeAccountingConnect,
  validateAccountingOAuthState,
} from '@/lib/services/accounting-connectors-service';
import { accountingCallbackContract } from './contract';

export const GET = withErrorHandler(
  runRoute(accountingCallbackContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAccountingEnabled(membership);
    requireAccountingWritePermission(membership);

    validateAccountingOAuthState(
      query.state,
      communityId,
      actorUserId,
      query.provider,
    );

    return completeAccountingConnect(
      communityId,
      actorUserId,
      query.provider,
      query.code,
      req.headers.get('x-request-id'),
    );
  }),
);
