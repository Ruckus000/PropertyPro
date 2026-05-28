/**
 * Route contract for `GET /api/v1/accounting/callback`.
 *
 * Plan A1 drain #91. GET-only OAuth callback completion endpoint for
 * QuickBooks/Xero accounting connections.
 *
 * Authorization invariants (preserved verbatim):
 *   requireAuthenticatedUserId
 *   → resolveEffectiveCommunityId(req, query.communityId)
 *   → requireCommunityMembership(communityId, actorUserId)
 *   → requireAccountingEnabled(membership)            (SYNC)
 *   → requireAccountingWritePermission(membership)    (SYNC)
 *   → validateAccountingOAuthState(state, communityId, actorUserId, provider) (SYNC, throws)
 *   → completeAccountingConnect(communityId, actorUserId, provider, code, requestId)
 *
 * Pre-migration sequencing nuance:
 *   The original handler ran `parseCommunityIdFromQuery(req)` FIRST (extracted
 *   `communityId`), THEN provider validation via `safeParse`, THEN
 *   `validateAccountingOAuthState` (which itself fed off
 *   `searchParams.get('state')`), THEN an inline `if (!code || code.trim().length === 0)`
 *   check. The contract now lifts ALL query fields — `communityId`, `provider`,
 *   `state`, `code` — into Zod query validation. As a result, missing/empty
 *   `state` or `code` now produces a 400 `VALIDATION_ERROR` BEFORE
 *   membership/permission gates fire (the pre-migration handler produced a
 *   400 `BAD_REQUEST` for empty `code` AFTER membership + permission +
 *   `validateAccountingOAuthState`, and the null-state branch surfaced as a
 *   `BadRequestError` thrown from inside `validateAccountingOAuthState`).
 *   No functional impact for the OAuth happy path: real OAuth callbacks
 *   always carry both `state` and `code`.
 *
 * The `state` and `code` `min(1)` Zod refinements pre-empt the null-state
 * and empty-code cases at the runner boundary, so those branches inside
 * `validateAccountingOAuthState` and the inline `code` check become
 * unreachable post-migration. `validateAccountingOAuthState` still throws
 * `BadRequestError` for MALFORMED state (non-base64url payload,
 * signature-invalid, payload-malformed, provider-mismatch, expired) and
 * `ForbiddenError` for communityId/userId mismatch.
 *
 * Response: loose `z.unknown()`. `completeAccountingConnect` returns a
 * service-shaped record (provider-specific connection metadata) that may
 * carry Date fields; tight modeling would risk `safeParse`-fail before
 * serialization. Wire shape stays byte-identical at `{ data: <service-result> }`.
 *
 * Permission: `{ resource: 'accounting', action: 'write' }`. `accounting`
 * IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts:50`), so
 * this is a non-placeholder permission pair. `'write'` matches the
 * runtime gate enforced by `requireAccountingWritePermission`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  provider: z.enum(['quickbooks', 'xero']),
  state: z.string().min(1),
  code: z.string().trim().min(1),
});

export const accountingCallbackContract = defineRoute({
  method: 'GET',
  path: '/api/v1/accounting/callback',
  request: { query: querySchema },
  response: z.unknown(),
  permission: { resource: 'accounting', action: 'write' },
});
