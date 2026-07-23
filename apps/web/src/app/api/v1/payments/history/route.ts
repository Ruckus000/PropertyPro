/**
 * GET /api/v1/payments/history — list payment history for a community,
 * optionally filtered to a single unit.
 *
 * Plan A1 drain #25. Wraps the existing handler with `runRoute(contract,
 * handler)` from `@propertypro/api-contract`. The wire response is
 * byte-identical to the pre-migration shape — `{ data: history }` — and
 * the conditional resident-owner branch is preserved VERBATIM.
 *
 * Auth chain (preserved verbatim from pre-migration, runner-friendly
 * plumbing only):
 *   1. `requireAuthenticatedUserId()` — Supabase session, 401 on miss.
 *   2. `resolveEffectiveCommunityId(req, query.communityId)` — replaces
 *      `parseCommunityIdFromQuery(req)`. Functionally equivalent: both
 *      delegate to `resolveEffectiveCommunityId` after validating the
 *      `communityId` query param. Behavior delta: invalid/missing
 *      `communityId` now returns the canonical `VALIDATION_ERROR` envelope
 *      at 400 (Zod-coerce path) instead of `BAD_REQUEST` via
 *      `BadRequestError`; status code stays 400. Header/query mismatch
 *      still throws 404 via `resolveEffectiveCommunityId` (canonical).
 *   3. `requireCommunityMembership(communityId, actorUserId)` — 403 on
 *      non-members.
 *   4. `requireFinanceEnabled(membership)` — 403 + plan-feature gate.
 *   5. Resident-owner branch (preserved verbatim — see contract docblock).
 *      Non-resident branch calls `requireFinanceReadPermission(membership)`.
 *   6. `listPaymentHistoryForCommunity(communityId, unitId)` — service
 *      call; returns payment rows with Date fields. Loose response
 *      modeling in the contract avoids `safeParse`-fail before
 *      `NextResponse.json` serializes Dates.
 *
 * Business-rule error messages preserved BYTE-IDENTICAL:
 *   - 'No unit association found for this owner' (ForbiddenError) — both
 *     the zero-units and the single-unit-but-undefined-id edge case
 *     (defensive belt-and-braces against an empty-array short-circuit).
 *   - 'unitId query parameter is required when you are associated with
 *     multiple units' (BadRequestError) — both the explicit multi-unit
 *     path and the dead-fallback else-branch (preserved for defensive
 *     parity with pre-migration).
 *   - 'Owners can only access payment history for their own unit'
 *     (ForbiddenError) — explicit `unitId` not in actor's owned set.
 *
 * Replacement of `parsePositiveInt(rawUnitId, 'unitId')`: the Zod schema
 * coerces and validates `unitId` upstream. Malformed `unitId` (e.g.
 * `?unitId=abc` or `?unitId=0`) previously threw
 * `BadRequestError('unitId must be a positive integer')` (wire envelope
 * `BAD_REQUEST`); the post-migration path returns the runner's canonical
 * `VALIDATION_ERROR` envelope at the same 400 status. The only consumer
 * (`useFinance` in `apps/web/src/hooks/use-finance.ts:266`) reads `res.ok`
 * opaquely, so the delta is safe.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { BadRequestError, ForbiddenError } from '@/lib/api/errors';
import { requireFinanceEnabled, requireFinanceReadPermission } from '@/lib/finance/common';
import {
  listActorUnitIdsForFinance,
  listPaymentHistoryForCommunity,
} from '@/lib/services/finance-service';
import { paymentsHistoryGetContract } from './contract';

export const GET = withErrorHandler(
  runRoute(paymentsHistoryGetContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requireFinanceEnabled(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    let unitId: number | undefined;

    if (membership.role === 'resident' && membership.isUnitOwner) {
      const actorUnitIds = await listActorUnitIdsForFinance(communityId, actorUserId);
      if (actorUnitIds.length === 0) {
        throw new ForbiddenError('No unit association found for this owner');
      }
      if (query.unitId === undefined && actorUnitIds.length > 1) {
        throw new BadRequestError(
          'unitId query parameter is required when you are associated with multiple units',
        );
      }
      if (query.unitId !== undefined) {
        if (!actorUnitIds.includes(query.unitId)) {
          throw new ForbiddenError(
            'Owners can only access payment history for their own unit',
          );
        }
        unitId = query.unitId;
      } else if (actorUnitIds.length === 1) {
        const onlyUnitId = actorUnitIds[0];
        if (onlyUnitId === undefined) {
          throw new ForbiddenError('No unit association found for this owner');
        }
        unitId = onlyUnitId;
      } else {
        throw new BadRequestError(
          'unitId query parameter is required when you are associated with multiple units',
        );
      }
    } else {
      requireFinanceReadPermission(membership);
      if (query.unitId !== undefined) {
        unitId = query.unitId;
      }
    }

    return await listPaymentHistoryForCommunity(communityId, unitId);
  }),
);
