/**
 * Past-due rule API — the community's definition of a past-due unit.
 *
 * GET   /api/v1/payments/past-due-rule?communityId=N — finance readers
 * PATCH /api/v1/payments/past-due-rule               — finance admins
 *
 * Auth chain mirrors /payments/fee-policy, plus finances:read on GET (the rule
 * only matters to people who can see balances).
 */
import { runRoute } from '@/lib/api/run-route';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import {
  requireFinanceAdminWrite,
  requireFinanceEnabled,
  requireFinanceReadPermission,
} from '@/lib/finance/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { getPastDueRule, setPastDueRule } from '@/lib/services/community-settings-service';
import { getPastDueRuleContract, patchPastDueRuleContract } from './contract';

export const GET = withErrorHandler(
  runRoute(getPastDueRuleContract, async ({ communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requireFinanceEnabled(membership);
    requireFinanceReadPermission(membership);
    // Lapsed communities lose admin reads (same as GET /api/v1/delinquency).
    await requireEntitledForAdminRead(communityId, membership);
    return getPastDueRule(communityId);
  }),
);

export const PATCH = withErrorHandler(
  runRoute(patchPastDueRuleContract, async ({ body, req, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requireFinanceEnabled(membership);
    requireFinanceAdminWrite(membership);

    const rule = { minCents: body.minCents, minDays: body.minDays };
    const previous = await setPastDueRule(communityId, rule);

    await logAuditEvent({
      userId: actorUserId,
      action: 'settings_changed',
      resourceType: 'community',
      resourceId: String(communityId),
      communityId,
      oldValues: { pastDueMinCents: previous.minCents, pastDueMinDays: previous.minDays },
      newValues: { pastDueMinCents: rule.minCents, pastDueMinDays: rule.minDays },
      metadata: { requestId: req.headers.get('x-request-id') ?? null },
    });

    return rule;
  }),
);
