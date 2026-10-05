/**
 * Lease deposits — Leases v3, the §83.49 record.
 *
 * Authorization — every verb: requireAuthenticatedUserId → assertNotDemoGrace
 * → requireCommunityMembership → apartment gate →
 * requirePermission(membership, 'units', 'write'). Deposits are financial and
 * manager-only; residents never read this route.
 *
 * Statute arithmetic lives in `@/lib/leases/lease-state` and is shown by the
 * page; this route records facts. Citations still need counsel sign-off
 * (docs/superpowers/specs/2026-09-29-leases-v3-decisions.md §4).
 */
import { runRoute } from '@/lib/api/run-route';
import { logAuditEvent } from '@propertypro/db';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  getLeaseById,
  getLeaseDepositById,
  insertLeaseDeposit,
  updateLeaseDeposit,
} from '@/lib/services/lease-service';
import { leaseDepositsPatchContract, leaseDepositsPostContract } from './contract';

function requireApartment(communityType: Parameters<typeof getFeaturesForCommunity>[0]): void {
  if (!getFeaturesForCommunity(communityType).hasLeaseTracking) {
    throw new ForbiddenError('Lease tracking is only available for apartment communities');
  }
}

export const POST = withErrorHandler(
  runRoute(leaseDepositsPostContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireApartment(membership.communityType);
    requirePermission(membership, 'units', 'write');

    const lease = await getLeaseById(communityId, body.leaseId);
    if (!lease) throw new NotFoundError('Lease not found');
    if (body.noticeSentOn && body.receivedOn && body.noticeSentOn < body.receivedOn) {
      throw new ValidationError('The notice cannot be sent before the deposit was received');
    }

    const deposit = await insertLeaseDeposit(communityId, {
      leaseId: body.leaseId,
      amount: body.amount,
      heldMethod: body.heldMethod ?? null,
      depository: body.depository ?? null,
      receivedOn: body.receivedOn ?? null,
      noticeSentOn: body.noticeSentOn ?? null,
      createdBy: actorUserId,
    });

    await logAuditEvent({
      userId: actorUserId,
      action: 'create',
      resourceType: 'lease_deposit',
      resourceId: String(deposit.id),
      communityId,
      newValues: { leaseId: body.leaseId, amount: body.amount, heldMethod: body.heldMethod ?? null, receivedOn: body.receivedOn ?? null },
    });
    return deposit;
  }),
);

export const PATCH = withErrorHandler(
  runRoute(leaseDepositsPatchContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireApartment(membership.communityType);
    requirePermission(membership, 'units', 'write');

    const { communityId: _c, depositId, ...fields } = body;
    const values = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    if (Object.keys(values).length === 0) throw new ValidationError('No fields to update');

    // The deposit must belong to a lease in THIS community. The scoped client
    // and the composite FK already guarantee it; reading it back also gives
    // the audit log its old values and the amount for the claim check.
    const existing = await getLeaseDepositById(communityId, depositId);
    if (!existing) throw new NotFoundError('Deposit not found');
    if (fields.disposition === 'claim_sent' && !fields.claimedAmount && !existing.claimedAmount) {
      throw new ValidationError('A claim needs the amount kept (claimedAmount)');
    }
    if (fields.claimedAmount && Number(fields.claimedAmount) > Number(existing.amount)) {
      throw new ValidationError('The amount kept cannot exceed the deposit');
    }
    if (fields.disposition && !fields.dispositionOn && !existing.dispositionOn) {
      throw new ValidationError('dispositionOn is required with a disposition');
    }

    const updated = await updateLeaseDeposit(communityId, depositId, values);
    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'lease_deposit',
      resourceId: String(depositId),
      communityId,
      oldValues: Object.fromEntries(Object.keys(values).map((k) => [k, existing[k] ?? null])),
      newValues: values,
    });
    return updated;
  }),
);
