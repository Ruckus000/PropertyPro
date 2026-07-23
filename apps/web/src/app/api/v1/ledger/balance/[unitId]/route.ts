/**
 * GET /api/v1/ledger/balance/[unitId]
 *
 * Returns the ledger balance for a single unit. Used by finance UI to
 * display per-unit dues and balances.
 *
 * Plan A1 drain (post-pilot drain #3). First drain that exercises the
 * runner's `params` parsing path (`unitId` lives in the URL path
 * segment). Input validation, output validation, and canonical envelope
 * wrapping are delegated to `runRoute()` from `@propertypro/api-contract`.
 * The wire response is the canonical single-payload envelope:
 *
 *     { data: { unitId, balanceCents, balanceDollars } }
 *
 * Authorization chain:
 *   1. `requireAuthenticatedUserId()` — Supabase session.
 *   2. `resolveEffectiveCommunityId(req, query.communityId)` —
 *      reconciles `x-community-id` header + query; throws 404 on
 *      mismatch / forged headers (canonical pattern; replaces the prior
 *      `parseCommunityIdFromQuery` + ad-hoc 400).
 *   3. `requireCommunityMembership(communityId, userId)` — 403 on
 *      non-members.
 *   4. `requireFinanceEnabled(membership)` — gated by community plan.
 *   5. Owner-vs-staff branch:
 *        - Resident unit-owner → may only read their OWN unit's balance
 *          (cross-unit access throws 403 with the original literal).
 *        - Anyone else → `requireFinanceReadPermission(membership)`
 *          (the standard finance RBAC check).
 *
 * Behavior change vs. pre-migration: header/query communityId mismatch
 * now returns 404 ("Community not found") instead of 400, matching the
 * document-categories pilot and drain #2. Invalid `unitId` and missing
 * `communityId` still return 400, now via `ContractValidationError`
 * (was: `BadRequestError`). Security semantics are identical.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { ForbiddenError } from '@/lib/api/errors';
import { requireFinanceEnabled, requireFinanceReadPermission } from '@/lib/finance/common';
import { getLedgerBalanceForUnit, listActorUnitIdsForFinance } from '@/lib/services/finance-service';
import { ledgerBalanceContract } from './contract';

export const GET = withErrorHandler(
  runRoute(ledgerBalanceContract, async ({ params, query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const requestedUnitId = params.unitId;
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requireFinanceEnabled(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    if (membership.role === 'resident' && membership.isUnitOwner) {
      const actorUnitIds = await listActorUnitIdsForFinance(communityId, actorUserId);
      if (actorUnitIds.length === 0) {
        throw new ForbiddenError('No unit association found for this owner');
      }
      if (!actorUnitIds.includes(requestedUnitId)) {
        throw new ForbiddenError('Owners can only access balance for their own unit');
      }
    } else {
      requireFinanceReadPermission(membership);
    }

    const balanceCents = await getLedgerBalanceForUnit(communityId, requestedUnitId);
    return {
      unitId: requestedUnitId,
      balanceCents,
      balanceDollars: (balanceCents / 100).toFixed(2),
    };
  }),
);
