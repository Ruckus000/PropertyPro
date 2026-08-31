/**
 * Violations — impose a fine on a violation (admin-facing).
 *
 * POST /api/v1/violations/[id]/fine
 * Body: { communityId, amountCents, dueDate?, graceDays?, notes? }
 *
 * Plan A1 drain #77. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireViolationsEnabled (ASYNC — awaited)
 *     → requirePermission('violations', 'write')
 *     → requireViolationAdminWrite (sync, isAdmin gate)
 *     → imposeViolationFineForCommunity(communityId, violationId, actorUserId,
 *         { amountCents, dueDate, graceDays, notes ?? null }, x-request-id)
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status unchanged. Success wire shape `{ data: ... }` byte-identical.
 *
 * `x-request-id` header forwarded verbatim to `imposeViolationFineForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import {
  requireViolationAdminWrite,
  requireViolationFinesEnabled,
  requireViolationsEnabled,
} from '@/lib/violations/common';
import { imposeViolationFineForCommunity } from '@/lib/services/violations-service';
import { requirePermission } from '@/lib/db/access-control';
import { violationsFineContract } from './contract';

export const POST = withErrorHandler(
  runRoute(violationsFineContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    await requireActiveSubscriptionForMutation(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireViolationsEnabled(membership);
    // Legal gate — fines still ship disabled by default. The two things that
    // blocked re-enabling them are now in place: the §718.303(3)/§720.305(2)
    // amount caps (enforced in the service, which can see the other fines on
    // the violation) and the required fining-committee record (enforced by the
    // contract above). WRITES only; existing fines stay readable via the
    // violations GET responses. See docs/audits/2026-08-09-legal-risk-audit.md F-04.
    requireViolationFinesEnabled(membership);
    requirePermission(membership, 'violations', 'write');
    requireViolationAdminWrite(membership);

    return imposeViolationFineForCommunity(
      communityId,
      params.id,
      actorUserId,
      {
        amountCents: body.amountCents,
        dueDate: body.dueDate,
        graceDays: body.graceDays,
        notes: body.notes ?? null,
        approvedByCommittee: body.approvedByCommittee,
        committeeMembers: body.committeeMembers,
        // Caps are resolved onto the membership at hydration, so enforcing them
        // costs no extra query.
        caps: membership.fineCaps,
      },
      req.headers.get('x-request-id'),
    );
  }),
);
