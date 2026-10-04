/**
 * Transfer to another unit — Leases v3 (E8), decisions §1 option A.
 *
 * Order matters, because the scoped client has no transactions:
 *   1. validate everything (old lease current and not already leaving, no
 *      unpaid rent on it — D9, target unit online and free)
 *   2. create the new lease (createLease — same checks as a direct create)
 *   3. schedule the old lease's move-out (end_via 'transfer')
 *   4. carry the deposit: a new deposit row on the new lease that points at
 *      the old one, and the old one marked 'carried_to_transfer'
 * Any failure after (2) soft-deletes the new lease and restores the old one.
 *
 * Counsel question left open (decisions §1.4): whether carrying a deposit is
 * "vacating" under §83.49(3) or a change of holding needing a new notice.
 *
 * Authorization: requireAuthenticatedUserId → assertNotDemoGrace →
 * requireCommunityMembership → apartment gate →
 * requirePermission(membership, 'units', 'write').
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
import { utcDateToWallClockValue } from '@/lib/utils/zoned-datetime';
import { createLease, type LeaseResidentInput } from '@/lib/leases/create-lease';
import { ensureNoUnpaidObligations, isZeroRent, startMoveOutChecklist } from '@/lib/leases/lease-rules';
import {
  getLeaseById,
  listLeaseDeposits,
  listLeaseResidentsForLeases,
  softDeleteLeaseForCommunity,
  updateLeaseDeposit,
  updateLeaseForCommunity,
} from '@/lib/services/lease-service';
import { leaseTransferPostContract } from './contract';

export const POST = withErrorHandler(
  runRoute(leaseTransferPostContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    if (!getFeaturesForCommunity(membership.communityType).hasLeaseTracking) {
      throw new ForbiddenError('Lease tracking is only available for apartment communities');
    }
    requirePermission(membership, 'units', 'write');

    const today = utcDateToWallClockValue(new Date(), membership.timezone ?? 'America/New_York').slice(0, 10);
    const from = await getLeaseById(communityId, body.fromLeaseId);
    if (!from) throw new NotFoundError('Lease not found');
    if (from['status'] !== 'active' || (from['startDate'] as string) > today) {
      throw new ValidationError('Only a current lease can be transferred');
    }
    if (from['moveOutOn']) {
      throw new ValidationError('This resident is already moving out. Cancel that first.');
    }
    if (from['unitId'] === body.toUnitId) {
      throw new ValidationError('Pick a different unit to transfer to');
    }
    if (body.moveOutOn < today) throw new ValidationError('moveOutOn cannot be in the past');
    if (body.startDate <= body.moveOutOn) {
      throw new ValidationError('The new lease must start after the last day in the old unit');
    }
    if (isZeroRent(body.rentAmount) && !body.zeroRentReason) {
      throw new ValidationError('A $0 rent needs a reason (zeroRentReason)');
    }
    await ensureNoUnpaidObligations(communityId, body.fromLeaseId, 'transfer this lease');

    const residents: LeaseResidentInput[] = (await listLeaseResidentsForLeases(communityId, [body.fromLeaseId]))
      .filter((r) => r.removedOn == null)
      .map((r) =>
        r.userId ? { userId: r.userId, isPrimary: r.isPrimary } : { occupantId: r.occupantId as number, isPrimary: r.isPrimary },
      );
    if (residents.length === 0 && from['residentId']) {
      residents.push({ userId: from['residentId'] as string, isPrimary: true });
    }
    const oldDeposit = body.carryDeposit
      ? (await listLeaseDeposits(communityId, [body.fromLeaseId])).filter((d) => !d.disposition).at(-1)
      : undefined;
    if (body.carryDeposit && !oldDeposit) {
      throw new ValidationError('There is no open deposit on this lease to carry over');
    }

    // (2) new lease — createLease also refuses an offline or occupied unit.
    const created = await createLease(
      { communityId, actorUserId, communityType: membership.communityType },
      {
        unitId: body.toUnitId,
        residents,
        startDate: body.startDate,
        endDate: body.endDate ?? null,
        rentAmount: body.rentAmount,
        zeroRentReason: body.zeroRentReason ?? null,
        zeroRentNote: body.zeroRentNote ?? null,
        noticeDays: body.noticeDays ?? null,
        transferredFromLeaseId: body.fromLeaseId,
        deposit: oldDeposit
          ? {
              amount: body.depositAmount ?? oldDeposit.amount,
              heldMethod: (oldDeposit.heldMethod as never) ?? null,
              depository: oldDeposit.depository,
              receivedOn: oldDeposit.receivedOn,
              noticeSentOn: body.depositAmount && Number(body.depositAmount) !== Number(oldDeposit.amount)
                ? null // a changed amount restarts the §83.49(2) notice
                : oldDeposit.noticeSentOn,
              carriedFromDepositId: oldDeposit.id,
            }
          : null,
        idempotencyKey: body.idempotencyKey,
      },
    );
    const newLeaseId = created['id'] as number;

    // (3) + (4), compensating on failure.
    try {
      await updateLeaseForCommunity(communityId, body.fromLeaseId, {
        moveOutOn: body.moveOutOn,
        endVia: 'transfer',
        endReason: body.reason ?? null,
        updatedBy: actorUserId,
        version: ((from['version'] as number | undefined) ?? 1) + 1,
      });
      if (oldDeposit) {
        await updateLeaseDeposit(communityId, oldDeposit.id, {
          disposition: 'carried_to_transfer',
          dispositionOn: body.moveOutOn,
        });
      }
    } catch (err) {
      await softDeleteLeaseForCommunity(communityId, newLeaseId);
      await updateLeaseForCommunity(communityId, body.fromLeaseId, {
        moveOutOn: null,
        endVia: null,
        endReason: null,
      });
      throw err;
    }

    await startMoveOutChecklist(communityId, from, actorUserId, membership.communityType);

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'lease',
      resourceId: String(body.fromLeaseId),
      communityId,
      oldValues: { moveOutOn: null, endVia: null },
      newValues: { moveOutOn: body.moveOutOn, endVia: 'transfer', transferredToLeaseId: newLeaseId, depositCarried: !!oldDeposit },
    });
    return { fromLeaseId: body.fromLeaseId, lease: created };
  }),
);
