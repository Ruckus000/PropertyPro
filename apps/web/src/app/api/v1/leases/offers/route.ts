/**
 * Renewal offers — Leases v3 (#9, E3, E4, E6, E9).
 *
 * A renewal is an offer first and a lease second. Sending an offer never
 * touches the current lease. Signing creates the renewal lease through the
 * same `createLease` a direct POST uses, starting the day after the current
 * lease ends; the current lease stays `active` — and current — until then.
 * Declining schedules the move-out on the current lease (end_via 'declined').
 *
 * Authorization — every verb, before any read or write:
 *   requireAuthenticatedUserId → (mutations) assertNotDemoGrace →
 *   requireCommunityMembership → apartment gate →
 *   requirePermission(membership, 'units', 'write').
 * Offers are manager data (proposed rent, deposit); the resident-facing view
 * arrives with the resident portal, not here.
 */
import { runRoute } from '@/lib/api/run-route';
import { logAuditEvent } from '@propertypro/db';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { utcDateToWallClockValue } from '@/lib/utils/zoned-datetime';
import { createLease, type LeaseResidentInput } from '@/lib/leases/create-lease';
import { startMoveOutChecklist } from '@/lib/leases/lease-rules';
import { addDays, termEndDate } from '@/lib/leases/lease-state';
import { isUniqueViolation, isZeroRent } from '@/lib/leases/lease-rules';
import {
  getLeaseById,
  getRenewalOffer,
  insertRenewalOffer,
  listLeaseDeposits,
  listLeaseResidentsForLeases,
  listRenewalOffers,
  updateLeaseForCommunity,
  updateRenewalOfferFromStage,
} from '@/lib/services/lease-service';
import {
  leaseOffersGetContract,
  leaseOffersPatchContract,
  leaseOffersPostContract,
} from './contract';

function requireApartment(communityType: Parameters<typeof getFeaturesForCommunity>[0]): void {
  if (!getFeaturesForCommunity(communityType).hasLeaseTracking) {
    throw new ForbiddenError('Lease tracking is only available for apartment communities');
  }
}

function today(timezone: string | undefined): string {
  return utcDateToWallClockValue(new Date(), timezone ?? 'America/New_York').slice(0, 10);
}

// ---------------------------------------------------------------------------
// GET — offers for ?leaseIds=1,2,3 (managers)
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(
  runRoute(leaseOffersGetContract, async ({ req, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    // Lapsed communities lose admin reads, like the parent leases route.
    await requireEntitledForAdminRead(communityId, membership);
    requireApartment(membership.communityType);
    requirePermission(membership, 'units', 'write');

    // Lenient parse, like the parent route's filters: junk ids are ignored.
    const leaseIds = (new URL(req.url).searchParams.get('leaseIds') ?? '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, 500);
    return listRenewalOffers(communityId, leaseIds);
  }),
);

// ---------------------------------------------------------------------------
// POST — send an offer
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(
  runRoute(leaseOffersPostContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireApartment(membership.communityType);
    requirePermission(membership, 'units', 'write');

    const lease = await getLeaseById(communityId, body.leaseId);
    if (!lease) throw new NotFoundError('Lease not found');
    if (lease['status'] !== 'active') {
      throw new ValidationError('Only an active lease can receive a renewal offer');
    }
    if (lease['moveOutOn'] && lease['endVia'] !== 'expiry') {
      throw new ValidationError('This resident is moving out. Cancel the move-out before sending an offer.');
    }
    if (body.termMonths != null && body.customEndDate != null) {
      throw new ValidationError('Send either termMonths or customEndDate, not both');
    }
    if (isZeroRent(body.offerRent) && !body.zeroRentReason) {
      throw new ValidationError('A $0 rent needs a reason (zeroRentReason)');
    }

    // The renewal starts the day after the current term. A month-to-month
    // lease has no end, so the offer names its start.
    const leaseEnd = (lease['endDate'] as string | null) ?? null;
    const startDate = leaseEnd ? addDays(leaseEnd, 1) : body.startDate;
    if (!startDate) {
      throw new ValidationError('startDate is required to renew a month-to-month lease');
    }
    if (leaseEnd && body.startDate && body.startDate !== startDate) {
      throw new ValidationError('A renewal starts the day after the current lease ends');
    }
    const sentOn = today(membership.timezone);
    if (body.expiresOn < sentOn) throw new ValidationError('expiresOn cannot be in the past');
    if (body.expiresOn >= startDate) {
      throw new ValidationError('The offer must expire before the renewal would start');
    }
    const endDate = body.customEndDate ?? (body.termMonths ? termEndDate(startDate, body.termMonths) : null);
    if (endDate && endDate <= startDate) throw new ValidationError('endDate must be after startDate');
    if (body.customEndDate && body.customEndDate > termEndDate(startDate, 36)) {
      throw new ValidationError('A custom term can be at most 36 months');
    }

    let offer;
    try {
      offer = await insertRenewalOffer(communityId, {
        leaseId: body.leaseId,
        offerRent: body.offerRent,
        zeroRentReason: isZeroRent(body.offerRent) ? body.zeroRentReason ?? null : null,
        termMonths: body.termMonths ?? null,
        customEndDate: body.customEndDate ?? null,
        startDate,
        depositAmount: body.depositAmount ?? null,
        proposedResidents: body.proposedResidents ?? null,
        sentOn,
        expiresOn: body.expiresOn,
        idempotencyKey: body.idempotencyKey ?? null,
        createdBy: actorUserId,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('This lease already has an open offer. Withdraw or expire it before sending another.');
      }
      throw err;
    }

    await logAuditEvent({
      userId: actorUserId,
      action: 'create',
      resourceType: 'lease_renewal_offer',
      resourceId: String(offer.id),
      communityId,
      newValues: { leaseId: body.leaseId, offerRent: body.offerRent, startDate, endDate, expiresOn: body.expiresOn },
    });
    return offer;
  }),
);

// ---------------------------------------------------------------------------
// PATCH — respond to / close / sign an offer
// ---------------------------------------------------------------------------

export const PATCH = withErrorHandler(
  runRoute(leaseOffersPatchContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireApartment(membership.communityType);
    requirePermission(membership, 'units', 'write');

    const offer = await getRenewalOffer(communityId, body.offerId);
    if (!offer) throw new NotFoundError('Offer not found');
    const lease = await getLeaseById(communityId, offer.leaseId);
    if (!lease) throw new NotFoundError('Lease not found');
    const respondedOn = body.respondedOn ?? today(membership.timezone);
    const lost = () =>
      new ConflictError('This offer changed since you opened it. Reload to see the latest version.');

    let updated;
    switch (body.action) {
      case 'accept':
        updated = await updateRenewalOfferFromStage(communityId, offer.id, ['offer_sent'], {
          stage: 'accepted',
          respondedOn,
          respondedVia: 'manager',
        });
        if (!updated) throw lost();
        break;

      case 'withdraw':
      case 'expire':
        updated = await updateRenewalOfferFromStage(communityId, offer.id, ['offer_sent', 'accepted'], {
          stage: body.action === 'withdraw' ? 'withdrawn' : 'expired',
        });
        if (!updated) throw lost();
        break;

      case 'decline': {
        const moveOutOn = body.moveOutOn ?? (lease['endDate'] as string | null);
        if (!moveOutOn) {
          throw new ValidationError('moveOutOn is required when a month-to-month resident declines');
        }
        if (moveOutOn < (lease['startDate'] as string)) {
          throw new ValidationError('moveOutOn cannot be before the lease start date');
        }
        updated = await updateRenewalOfferFromStage(communityId, offer.id, ['offer_sent', 'accepted'], {
          stage: 'declined',
          respondedOn,
          respondedVia: 'manager',
        });
        if (!updated) throw lost();
        await updateLeaseForCommunity(communityId, offer.leaseId, {
          moveOutOn,
          endVia: 'declined',
          noticeReceivedOn: respondedOn,
          updatedBy: actorUserId,
          version: ((lease['version'] as number | undefined) ?? 1) + 1,
        });
        if (!lease['moveOutOn']) {
          await startMoveOutChecklist(communityId, lease, actorUserId, membership.communityType);
        }
        break;
      }

      case 'sign': {
        // Claim the offer first so two concurrent signs cannot both create a
        // lease; roll the claim back if creating the lease fails.
        const claimed = await updateRenewalOfferFromStage(communityId, offer.id, ['offer_sent', 'accepted'], {
          stage: 'signed',
          respondedOn,
          respondedVia: 'manager',
        });
        if (!claimed) throw lost();

        const currentResidents = await listLeaseResidentsForLeases(communityId, [offer.leaseId]);
        const residents: LeaseResidentInput[] =
          offer.proposedResidents && offer.proposedResidents.length > 0
            ? (offer.proposedResidents as LeaseResidentInput[])
            : currentResidents
                .filter((r) => r.removedOn == null)
                .map((r) =>
                  r.userId
                    ? { userId: r.userId, isPrimary: r.isPrimary }
                    : { contactId: r.contactId as number, isPrimary: r.isPrimary },
                );
        // A changed deposit is a new deposit row (it restarts the §83.49 clock).
        const deposits = await listLeaseDeposits(communityId, [offer.leaseId]);
        const currentDeposit = deposits.at(-1);
        const depositChanged =
          offer.depositAmount != null && (!currentDeposit || Number(currentDeposit.amount) !== Number(offer.depositAmount));

        const endDate = offer.customEndDate ?? (offer.termMonths ? termEndDate(offer.startDate, offer.termMonths) : null);
        // A month-to-month lease has no end; the renewal gives it one (the day
        // before the new term), otherwise both leases would read as current.
        const wasMonthToMonth = lease['endDate'] == null;
        if (wasMonthToMonth) {
          await updateLeaseForCommunity(communityId, offer.leaseId, {
            endDate: addDays(offer.startDate, -1),
            updatedBy: actorUserId,
            version: ((lease['version'] as number | undefined) ?? 1) + 1,
          });
        }
        let renewal;
        try {
          renewal = await createLease(
            { communityId, actorUserId, communityType: membership.communityType },
            {
              unitId: lease['unitId'] as number,
              residents,
              startDate: offer.startDate,
              endDate,
              rentAmount: offer.offerRent,
              zeroRentReason: isZeroRent(offer.offerRent) ? offer.zeroRentReason : null,
              previousLeaseId: offer.leaseId,
              isRenewal: true,
              noticeDays: body.noticeDays ?? ((lease['noticeDays'] as number | null) ?? null),
              signedDocumentId: body.signedDocumentId ?? null,
              deposit: depositChanged
                ? {
                    amount: offer.depositAmount as string,
                    heldMethod: (currentDeposit?.heldMethod as never) ?? null,
                    depository: currentDeposit?.depository ?? null,
                  }
                : null,
              idempotencyKey: body.idempotencyKey,
            },
          );
        } catch (err) {
          if (wasMonthToMonth) {
            await updateLeaseForCommunity(communityId, offer.leaseId, { endDate: null });
          }
          await updateRenewalOfferFromStage(communityId, offer.id, ['signed'], {
            stage: offer.stage,
            respondedOn: offer.respondedOn,
          });
          throw err;
        }
        updated = await updateRenewalOfferFromStage(communityId, offer.id, ['signed'], {
          renewalLeaseId: renewal['id'],
        });
        break;
      }
    }

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'lease_renewal_offer',
      resourceId: String(offer.id),
      communityId,
      oldValues: { stage: offer.stage },
      newValues: { stage: updated?.stage ?? null, action: body.action, renewalLeaseId: updated?.renewalLeaseId ?? null },
    });
    return updated;
  }),
);
