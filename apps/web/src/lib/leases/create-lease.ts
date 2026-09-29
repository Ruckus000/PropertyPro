/**
 * Leases v3 — create a lease with its residents and deposit.
 *
 * Shared by POST /api/v1/leases, signing a renewal offer, and transfers, so all
 * three run identical validation. The CALLER owns authorization: it must have
 * run the apartment gate and `requirePermission(membership, 'units', 'write')`
 * before calling this.
 *
 * The scoped client has no transactions, so writes compensate on failure
 * (the violations-service pattern): contacts, then the lease, then its
 * residents and deposit — each undone if a later step fails.
 */
import { logAuditEvent } from '@propertypro/db';
import type { CommunityType } from '@propertypro/shared';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import {
  createLeaseForCommunity,
  createResidentContact,
  deleteLeaseResidentsForLease,
  findLeaseByIdempotencyKey,
  getCommunityLeaseSettings,
  getTenantRoleForLease,
  getUnitLeaseDefaults,
  insertLeaseDeposit,
  insertLeaseResidents,
  listLeaseResidentsForLeases,
  listLeasesForCommunity,
  listResidentContactsByIds,
  softDeleteLeaseForCommunity,
  softDeleteResidentContact,
  type LeaseRow,
} from '@/lib/services/lease-service';
import { createMoveChecklist } from '@/lib/services/move-checklist-service';
import {
  ensureNoUnitLeaseOverlap,
  ensureRenewalContinuity,
  isUniqueViolation,
  isZeroRent,
  residentUserIdsFor,
  validateLeaseDateWindow,
  type LeaseLikeRow,
} from './lease-rules';

export type LeaseResidentInput =
  | { userId: string; isPrimary?: boolean }
  | { contactId: number; isPrimary?: boolean }
  | {
      newContact: {
        fullName: string;
        phone?: string | null;
        mailingAddress?: string | null;
        noticeDelivery?: 'mail' | 'hand';
      };
      isPrimary?: boolean;
    };

export interface CreateLeaseInput {
  unitId: number;
  residentId?: string;
  residents?: LeaseResidentInput[];
  startDate: string;
  endDate?: string | null;
  rentAmount?: string | null;
  status?: 'active' | 'expired' | 'renewed' | 'terminated' | 'cancelled';
  previousLeaseId?: number | null;
  notes?: string | null;
  isRenewal?: boolean;
  zeroRentReason?: 'staff' | 'courtesy_officer' | 'rent_free_agreement' | 'other' | null;
  zeroRentNote?: string | null;
  noticeDays?: number | null;
  deposit?: {
    amount: string;
    heldMethod?: 'separate_noninterest' | 'separate_interest' | 'surety_bond' | null;
    depository?: string | null;
    receivedOn?: string | null;
    noticeSentOn?: string | null;
    carriedFromDepositId?: number | null;
  } | null;
  signedDocumentId?: number | null;
  idempotencyKey?: string;
  /** E8: set by the transfer route. */
  transferredFromLeaseId?: number | null;
}

export interface CreateLeaseContext {
  communityId: number;
  actorUserId: string;
  communityType: CommunityType;
}

type ResolvedResident = { userId: string | null; contactId: number | null; isPrimary: boolean };

export async function createLease(
  { communityId, actorUserId, communityType }: CreateLeaseContext,
  payload: CreateLeaseInput,
): Promise<LeaseRow> {
  // Double-submit guard: a repeat of the same form submission returns the
  // lease the first one created instead of minting a second.
  if (payload.idempotencyKey) {
    const prior = await findLeaseByIdempotencyKey(communityId, payload.idempotencyKey);
    if (prior) return prior;
  }

  if (payload.status === 'cancelled') {
    throw new ValidationError('A new lease cannot be created as cancelled');
  }

  // Validate unit belongs to this community
  const unit = await getUnitLeaseDefaults(communityId, payload.unitId);
  if (!unit) {
    throw new ValidationError('Unit not found in this community');
  }
  if (unit['offlineSince']) {
    throw new ValidationError('This unit is offline. Bring it back online before adding a lease.');
  }
  const unitRentAmount = (unit['rentAmount'] as string | null) ?? null;

  // ── Residents ──────────────────────────────────────────────────────────
  const residentInputs =
    payload.residents ?? (payload.residentId ? [{ userId: payload.residentId }] : null);
  if (!residentInputs) {
    throw new ValidationError('residentId or residents is required');
  }
  const primaryCount = residentInputs.filter((r) => r.isPrimary === true).length;
  if (primaryCount > 1) {
    throw new ValidationError('Only one resident can be the primary resident');
  }
  const primaryIndex = Math.max(0, residentInputs.findIndex((r) => r.isPrimary === true));

  const needsContacts = residentInputs.some((r) => 'contactId' in r || 'newContact' in r);
  if (needsContacts) {
    const settings = await getCommunityLeaseSettings(communityId);
    if (!settings.allowResidentsWithoutEmail) {
      throw new ForbiddenError('Residents without an email address are not enabled for this community');
    }
  }

  // Validate every user has a tenant (non-owner resident) role in this community.
  const seenUsers = new Set<string>();
  for (const r of residentInputs) {
    if (!('userId' in r)) continue;
    if (seenUsers.has(r.userId)) throw new ValidationError('A resident is listed twice');
    seenUsers.add(r.userId);
    const residentRole = await getTenantRoleForLease(communityId, r.userId);
    if (!residentRole) {
      throw new ValidationError('Resident must have a tenant role in this community');
    }
  }
  const existingContactIds = residentInputs
    .filter((r): r is { contactId: number; isPrimary?: boolean } => 'contactId' in r)
    .map((r) => r.contactId);
  if (new Set(existingContactIds).size !== existingContactIds.length) {
    throw new ValidationError('A resident is listed twice');
  }
  if (existingContactIds.length > 0) {
    const found = await listResidentContactsByIds(communityId, existingContactIds);
    if (found.length !== existingContactIds.length) {
      throw new ValidationError('Resident contact not found in this community');
    }
  }

  validateLeaseDateWindow(payload.startDate, payload.endDate ?? null, {
    requireFirstOfMonth: !(payload.isRenewal || payload.previousLeaseId),
  });

  const effectiveRentAmount = payload.rentAmount ?? unitRentAmount;
  if (isZeroRent(effectiveRentAmount) && !payload.zeroRentReason) {
    throw new ValidationError('A $0 rent needs a reason (zeroRentReason)');
  }

  const existingLeaseRows = await listLeasesForCommunity(communityId);
  const existingLeases = existingLeaseRows as unknown as LeaseLikeRow[];
  ensureNoUnitLeaseOverlap(
    {
      unitId: payload.unitId,
      startDate: payload.startDate,
      endDate: payload.endDate ?? null,
    },
    existingLeases,
  );

  // Handle renewal logic
  const previousLeaseId = payload.previousLeaseId ?? null;
  if (payload.isRenewal || previousLeaseId !== null) {
    if (!previousLeaseId) {
      throw new ValidationError('previousLeaseId is required when creating a renewal lease');
    }
    // Verify the previous lease exists in this community
    const previousLease = existingLeases.find((row) => row.id === previousLeaseId);
    if (!previousLease) {
      throw new ValidationError('Previous lease not found in this community');
    }
    const residentRows = await listLeaseResidentsForLeases(communityId, [previousLeaseId]);
    ensureRenewalContinuity(
      {
        unitId: payload.unitId,
        residentUserIds: [...seenUsers],
        startDate: payload.startDate,
        previousLeaseId,
      },
      previousLease,
      residentUserIdsFor(previousLease, residentRows),
    );
    // Leases v3: the previous lease is deliberately NOT marked 'renewed'
    // here. It stays `active` — and current — until this renewal starts.
  }

  // ── Writes (no transactions in the scoped client: compensate on failure) ─
  const createdContactIds: number[] = [];
  const resolved: ResolvedResident[] = [];
  try {
    for (const [index, r] of residentInputs.entries()) {
      const isPrimary = index === primaryIndex;
      if ('userId' in r) resolved.push({ userId: r.userId, contactId: null, isPrimary });
      else if ('contactId' in r) resolved.push({ userId: null, contactId: r.contactId, isPrimary });
      else {
        const contact = await createResidentContact(communityId, {
          fullName: r.newContact.fullName,
          phone: r.newContact.phone ?? null,
          mailingAddress: r.newContact.mailingAddress ?? null,
          noticeDelivery: r.newContact.noticeDelivery ?? 'mail',
          createdBy: actorUserId,
        });
        createdContactIds.push(contact.id);
        resolved.push({ userId: null, contactId: contact.id, isPrimary });
      }
    }
  } catch (err) {
    for (const id of createdContactIds) await softDeleteResidentContact(communityId, id);
    throw err;
  }
  const primary = resolved.find((r) => r.isPrimary)!;

  let created: LeaseRow | null;
  try {
    created = await createLeaseForCommunity(communityId, {
      unitId: payload.unitId,
      // Dual-write during the expand window: the primary's user id, or null
      // when the primary resident is a contact-only person.
      residentId: primary.userId,
      startDate: payload.startDate,
      endDate: payload.endDate ?? null,
      rentAmount: effectiveRentAmount,
      zeroRentReason: isZeroRent(effectiveRentAmount) ? payload.zeroRentReason ?? null : null,
      zeroRentNote: isZeroRent(effectiveRentAmount) ? payload.zeroRentNote ?? null : null,
      noticeDays: payload.noticeDays ?? null,
      signedDocumentId: payload.signedDocumentId ?? null,
      transferredFromLeaseId: payload.transferredFromLeaseId ?? null,
      status: payload.status ?? 'active',
      previousLeaseId,
      notes: payload.notes ?? null,
      idempotencyKey: payload.idempotencyKey ?? null,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    });
  } catch (err) {
    for (const id of createdContactIds) await softDeleteResidentContact(communityId, id);
    // Lost a race with an identical submission: return the winner's lease.
    if (payload.idempotencyKey && isUniqueViolation(err)) {
      const winner = await findLeaseByIdempotencyKey(communityId, payload.idempotencyKey);
      if (winner) return winner;
    }
    throw err;
  }

  if (!created) {
    for (const id of createdContactIds) await softDeleteResidentContact(communityId, id);
    throw new ValidationError('Failed to create lease');
  }
  const leaseId = created['id'] as number;

  try {
    await insertLeaseResidents(
      communityId,
      resolved.map((r) => ({ leaseId, userId: r.userId, contactId: r.contactId, isPrimary: r.isPrimary, addedOn: payload.startDate })),
    );
    if (payload.deposit) {
      await insertLeaseDeposit(communityId, {
        leaseId,
        amount: payload.deposit.amount,
        heldMethod: payload.deposit.heldMethod ?? null,
        depository: payload.deposit.depository ?? null,
        receivedOn: payload.deposit.receivedOn ?? null,
        noticeSentOn: payload.deposit.noticeSentOn ?? null,
        carriedFromDepositId: payload.deposit.carriedFromDepositId ?? null,
        createdBy: actorUserId,
      });
    }
  } catch (err) {
    await deleteLeaseResidentsForLease(communityId, leaseId);
    await softDeleteLeaseForCommunity(communityId, leaseId);
    for (const id of createdContactIds) await softDeleteResidentContact(communityId, id);
    throw err;
  }

  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'lease',
    resourceId: String(leaseId),
    communityId,
    newValues: {
      unitId: payload.unitId,
      residentId: primary.userId,
      residents: resolved,
      startDate: payload.startDate,
      endDate: payload.endDate ?? null,
      rentAmount: effectiveRentAmount,
      zeroRentReason: isZeroRent(effectiveRentAmount) ? payload.zeroRentReason ?? null : null,
      status: payload.status ?? 'active',
      previousLeaseId,
      deposit: payload.deposit ?? null,
    },
  });

  // Best-effort: auto-create move-in checklist for apartment communities.
  // The checklist is keyed to a user, so it goes to the first resident who
  // has one; a lease of contact-only residents gets none.
  const checklistUserId = primary.userId ?? resolved.find((r) => r.userId)?.userId ?? null;
  // A renewal's residents already live in the unit: no move-in checklist.
  const isRenewal = !!(payload.isRenewal || payload.previousLeaseId);
  if (communityType === 'apartment' && checklistUserId && !isRenewal) {
    try {
      await createMoveChecklist(
        {
          communityId,
          leaseId,
          unitId: payload.unitId,
          residentId: checklistUserId,
          type: 'move_in',
        },
        actorUserId,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[leases] auto-create move-in checklist failed', {
        communityId,
        leaseId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return created;
}
