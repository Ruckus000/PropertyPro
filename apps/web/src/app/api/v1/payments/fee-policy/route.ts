/**
 * Payment Fee Policy API
 *
 * GET    /api/v1/payments/fee-policy?communityId=N  — read fee policy
 * PATCH  /api/v1/payments/fee-policy                — set fee policy (admin only)
 *
 * Plan A1 drain #13. Mirrors drain #4 (community/contact) — input
 * validation, output validation, and canonical envelope wrapping are
 * delegated to `runRoute()` from `@propertypro/api-contract`. Both
 * methods declare contracts in `./contract.ts`.
 *
 * Authorization invariants (preserved verbatim):
 *   GET   — `requireAuthenticatedUserId` → `resolveEffectiveCommunityId`
 *           → `requireCommunityMembership` → `requireFinanceEnabled`
 *   PATCH — `requireAuthenticatedUserId` → parseBody (Zod, runner)
 *           → `resolveEffectiveCommunityId` → `assertNotDemoGrace`
 *           → `requireCommunityMembership` → `requireFinanceEnabled`
 *           → `requireFinanceAdminWrite` → `setCommunityFeePolicy`
 *           → `logAuditEvent`.
 *
 * Audit log (preserved verbatim):
 *   action='settings_changed', resourceType='community',
 *   resourceId=String(communityId),
 *   oldValues.paymentFeePolicy=oldPolicy,
 *   newValues.paymentFeePolicy=body.feePolicy,
 *   metadata.requestId=req.headers.get('x-request-id') ?? null.
 *
 * Behavior changes vs. pre-migration:
 *   - GET: invalid `communityId` body shape now `VALIDATION_ERROR`
 *     envelope (was a hand-constructed `ValidationError` with a single
 *     message). Same 400.
 *   - PATCH: invalid body shape now `VALIDATION_ERROR` with per-field
 *     details (was: hand-constructed `ValidationError`). Same 400.
 *   - Both: header/query (or header/body) `communityId` mismatch returns
 *     404 via `resolveEffectiveCommunityId`. The pre-migration handlers
 *     used `parseResult.data.communityId` directly and IGNORED the
 *     `x-community-id` header entirely. This is the same intentional
 *     change adopted in drains #2 and #3 — security-aligned to the
 *     platform's canonical tenant reconciliation primitive, and no
 *     observed consumer dependency.
 */
import { runRoute } from '@propertypro/api-contract';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireFinanceAdminWrite, requireFinanceEnabled } from '@/lib/finance/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  getCommunityFeePolicy,
  setCommunityFeePolicy,
} from '@/lib/services/finance-service';
import { getFeePolicyContract, patchFeePolicyContract } from './contract';

export const GET = withErrorHandler(
  runRoute(getFeePolicyContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requireFinanceEnabled(membership);

    const feePolicy = await getCommunityFeePolicy(communityId);
    return { feePolicy };
  }),
);

export const PATCH = withErrorHandler(
  runRoute(patchFeePolicyContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requireFinanceEnabled(membership);
    requireFinanceAdminWrite(membership);

    const { oldPolicy } = await setCommunityFeePolicy(communityId, body.feePolicy);

    await logAuditEvent({
      userId: actorUserId,
      action: 'settings_changed',
      resourceType: 'community',
      resourceId: String(communityId),
      communityId,
      oldValues: { paymentFeePolicy: oldPolicy },
      newValues: { paymentFeePolicy: body.feePolicy },
      metadata: { requestId: req.headers.get('x-request-id') ?? null },
    });

    return { feePolicy: body.feePolicy };
  }),
);
