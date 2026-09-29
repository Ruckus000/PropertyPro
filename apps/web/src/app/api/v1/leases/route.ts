/**
 * Leases API — CRUD operations with expiration tracking and renewal chain (P2-37).
 *
 * Plan A1 drain. Migrated from `withErrorHandler(async ...)` to
 * `withErrorHandler(runRoute(contract, ...))`. See `./contract.ts` for the
 * input schemas, the GET-filter manual-parse rationale, the loose-vs-tight
 * response modeling, and why the contract's `permission` entries key on
 * `units` rather than a `leases` resource (AZ-01, interim until Phase 2.1).
 *
 * Authorization invariants (AZ-01 — this route is the ONLY enforcement point):
 *   `communityId` is resolved + injected by the runner from the contract's
 *   `tenantScope` (Plan B2): GET/DELETE → query, POST/PATCH → body. The
 *   reconciliation against the `x-community-id` header is unchanged — it now
 *   lives in the runner (`@/lib/api/run-route`) instead of an in-handler
 *   `resolveEffectiveCommunityId` call. Per-method chain:
 *   GET    — requireAuthenticatedUserId
 *          → requireCommunityMembership
 *          → requireApartmentCommunity
 *          → requireEntitledForAdminRead (admin-tier only; lapsed-subscription
 *            gate — it short-circuits for non-admins, so it is NOT a role gate)
 *          → party-scoped row filter: `isAdminRole(membership.role)` sees every
 *            lease in the community, anyone else only rows whose `residentId`
 *            is their own user id. The same visible set backs the
 *            `renewal_chain_for` traversal, so a chain rooted at someone
 *            else's lease resolves to nothing.
 *   POST   — requireAuthenticatedUserId
 *          → assertNotDemoGrace (BEFORE membership — corpus rule 2)
 *          → requireCommunityMembership
 *          → requireApartmentCommunity
 *          → requirePermission(membership, 'units', 'write')
 *   PATCH  — requireAuthenticatedUserId
 *          → assertNotDemoGrace (BEFORE membership)
 *          → requireCommunityMembership
 *          → requireApartmentCommunity
 *          → requirePermission(membership, 'units', 'write')
 *   DELETE — requireAuthenticatedUserId
 *          → assertNotDemoGrace (BEFORE membership)
 *          → requireCommunityMembership
 *          → requireApartmentCommunity
 *          → requirePermission(membership, 'units', 'write')
 *
 *   AZ-01 rationale. Before this gate the chain stopped at
 *   `requireCommunityMembership`, and `leases` is not an `RBAC_RESOURCES`
 *   member, so no matrix query was even possible: ANY member of an apartment
 *   community — including a tenant — could read and mutate EVERY lease in that
 *   community, rent amounts included. Neither the scoped client nor RLS closes
 *   it, because both connections run as `service_role`. `units:write` is true
 *   on the `manager` row only (`rbac-matrix.ts`, inherited by `apartment` via
 *   `withPhase5Defaults` with no `excludedCommunityTypes`), which is exactly
 *   what the only UI entry point (the Leases page) already enforces
 *   server-side, so the gate costs no reachable workflow.
 *
 * Patterns preserved:
 * - lease-service helpers for tenant-scoped DB access (AGENTS #13)
 * - logAuditEvent on every mutation
 * - Apartment-only feature gate (AGENTS #34)
 *
 * Leases v3 (docs/superpowers/plans/2026-09-29-leases-v3.md):
 * - READ BOUNDARY: a non-manager sees a lease when a current `lease_residents`
 *   row names them — so co-tenants see it too. `residentId === actor` stays as
 *   a fallback for leases written by pre-v3 code during the expand window.
 * - A renewal no longer flips the current lease to 'renewed' on creation. The
 *   current lease stays `active` until the renewal starts; phase is derived
 *   (`@/lib/leases/lease-state`). Flipping it early hid the current lease and
 *   blanked `units.rent_amount`, whose trigger only reads `active` leases.
 * - Overlap uses the EFFECTIVE end (move_out_on when earlier), so a unit can be
 *   pre-leased from the day after a scheduled move-out.
 * - Cancel / delete refuse while the lease has unpaid rent obligations (D9).
 * - PATCH honours `version` (409 when stale); POST honours `idempotencyKey`
 *   (a repeat submission returns the lease the first one created).
 */
import { runRoute } from '@/lib/api/run-route';
import { logAuditEvent } from '@propertypro/db';
import { getFeaturesForCommunity, isAdminRole, type CommunityType } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ConflictError, ForbiddenError, ValidationError, NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import {
  getExpiringLeases,
  getRenewalChain,
  type LeaseRecord,
} from '@/lib/services/lease-expiration-service';
import {
  getLeaseById,
  listLeaseDeposits,
  listLeaseIdsForParty,
  listLeaseResidentsForLeases,
  listLeasesForCommunity,
  listResidentContactsByIds,
  softDeleteLeaseForCommunity,
  updateLeaseForCommunity,
  updateLeaseIfVersion,
  type LeaseDepositRow,
  type LeaseResidentRow,
  type ResidentContactRow,
} from '@/lib/services/lease-service';
import { createLease } from '@/lib/leases/create-lease';
import {
  effectiveEndDate,
  ensureNoUnitLeaseOverlap,
  ensureNoUnpaidObligations,
  ensureRenewalContinuity,
  isZeroRent,
  residentUserIdsFor,
  validateLeaseDateWindow,
  type LeaseLikeRow,
} from '@/lib/leases/lease-rules';
import { createMoveChecklist } from '@/lib/services/move-checklist-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { utcDateToWallClockValue } from '@/lib/utils/zoned-datetime';
import {
  leasesGetContract,
  leasesPostContract,
  leasesPatchContract,
  leasesDeleteContract,
} from './contract';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Enforce that the community is an apartment.
 * [AGENTS #34] Lease tracking is apartment-only — check at route handler, not just UI.
 */
function requireApartmentCommunity(communityType: CommunityType): void {
  const features = getFeaturesForCommunity(communityType);
  if (!features.hasLeaseTracking) {
    throw new ForbiddenError('Lease tracking is only available for apartment communities');
  }
}

/** Today's date (YYYY-MM-DD) in the community's timezone (AGENTS #16-17). */
function communityToday(timezone: string | undefined): string {
  return utcDateToWallClockValue(new Date(), timezone ?? 'America/New_York').slice(0, 10);
}

function coerceLeaseRecord(row: Record<string, unknown>): LeaseRecord {
  const opt = <T>(key: string): T | null => (row[key] as T | null | undefined) ?? null;
  return {
    id: row['id'] as number,
    communityId: row['communityId'] as number,
    unitId: row['unitId'] as number,
    residentId: opt<string>('residentId'),
    startDate: row['startDate'] as string,
    endDate: opt<string>('endDate'),
    rentAmount: opt<string>('rentAmount'),
    status: row['status'] as string,
    previousLeaseId: opt<number>('previousLeaseId'),
    notes: opt<string>('notes'),
    version: (row['version'] as number | undefined) ?? 1,
    zeroRentReason: opt<string>('zeroRentReason'),
    zeroRentNote: opt<string>('zeroRentNote'),
    noticeDays: opt<number>('noticeDays'),
    moveOutOn: opt<string>('moveOutOn'),
    endVia: opt<string>('endVia'),
    endReason: opt<string>('endReason'),
    noticeReceivedOn: opt<string>('noticeReceivedOn'),
    cancelledReason: opt<string>('cancelledReason'),
    transferredFromLeaseId: opt<number>('transferredFromLeaseId'),
    signedDocumentId: opt<number>('signedDocumentId'),
  };
}

/** Public shape of a lease's residents; contact details only for managers. */
function residentsView(
  leaseId: number,
  residentRows: LeaseResidentRow[],
  contactsById: Map<number, ResidentContactRow>,
  isManager: boolean,
) {
  return residentRows
    .filter((r) => r.leaseId === leaseId)
    .map((r) => {
      const contact = r.contactId != null ? contactsById.get(r.contactId) : undefined;
      return {
        userId: r.userId,
        contactId: r.contactId,
        isPrimary: r.isPrimary,
        addedOn: r.addedOn,
        removedOn: r.removedOn,
        contact: contact
          ? {
              fullName: contact.fullName,
              ...(isManager
                ? {
                    phone: contact.phone,
                    mailingAddress: contact.mailingAddress,
                    noticeDelivery: contact.noticeDelivery,
                    linkedUserId: contact.linkedUserId,
                  }
                : {}),
            }
          : null,
      };
    });
}

// ---------------------------------------------------------------------------
// GET — List leases for a community with optional filters
// ---------------------------------------------------------------------------

// route-gate: self-scoped — non-managers see only leases they are a party to, notes redacted (AZ-01); managers see all
export const GET = withErrorHandler(
  runRoute(leasesGetContract, async ({ req, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();

    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireApartmentCommunity(membership.communityType);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    // AZ-01 read scoping — DELIBERATELY PARTY-SCOPED (roadmap ledger D1/D29).
    //
    // A permission gate would tighten nothing on this method: `units:read` is
    // true on every row of the matrix, so every member already holds it. What
    // the audit found is an unscoped ROW SET, so the boundary is enforced on
    // the rows instead.
    //
    // Management-tier callers keep the whole community's leases — that is the
    // live property-manager workflow. Everyone else sees ONLY the leases they
    // are a party to. Leases v3: "party" means a current `lease_residents` row
    // naming them (so co-tenants qualify), or — for leases written by pre-v3
    // code during the expand window — `residentId === actorUserId`. A unit
    // owner who is not a party therefore sees nothing: that is the ledger's
    // decision, not an oversight.
    //
    // Fail-closed by construction — `isAdminRole` resolves only the v3
    // management roles onto the admin row, so any other value gets the filter
    // rather than the full list.
    //
    // `notes` is manager-internal (product decision 2026-09-24, #1172): a party
    // sees their own lease rows, but never the notes a manager wrote on them.
    // Redacted here so the list AND the renewal-chain path both inherit it.
    // Deposits and contact details are manager-only for the same reason.
    const seesAllLeases = isAdminRole(membership.role);
    const partyLeaseIds = seesAllLeases
      ? new Set<number>()
      : await listLeaseIdsForParty(communityId, actorUserId);
    const visibleToActor = (records: LeaseRecord[]): LeaseRecord[] =>
      seesAllLeases
        ? records
        : records
            .filter((l) => partyLeaseIds.has(l.id) || l.residentId === actorUserId)
            .map((l) => ({ ...l, notes: null }));

    const rows = await listLeasesForCommunity(communityId);
    let leaseRecords = visibleToActor(rows.map(coerceLeaseRecord));

    // Optional filters — parsed manually from the URL to preserve the
    // pre-migration lenient semantics (malformed values are silently ignored,
    // not 400-ed). See contract.ts.
    const { searchParams } = new URL(req.url);

    // If requesting a specific lease's renewal chain
    const chainFor = searchParams.get('renewal_chain_for');
    if (chainFor) {
      const leaseId = Number(chainFor);
      if (Number.isInteger(leaseId) && leaseId > 0) {
        // Need all leases (not just active) for chain traversal — but all
        // leases VISIBLE TO THE ACTOR, the same party-scoped set the list above
        // uses, so asking for a chain rooted at someone else's lease yields an
        // empty array rather than that tenant's rental history.
        const allRows = await listLeasesForCommunity(communityId);
        const allLeases = visibleToActor(allRows.map(coerceLeaseRecord));
        const chain = getRenewalChain(leaseId, allLeases);
        return chain;
      }
    }

    const statusFilter = searchParams.get('status');
    if (statusFilter) {
      leaseRecords = leaseRecords.filter((l) => l.status === statusFilter);
    }

    const unitFilter = searchParams.get('unit');
    if (unitFilter) {
      const unitId = Number(unitFilter);
      if (Number.isInteger(unitId) && unitId > 0) {
        leaseRecords = leaseRecords.filter((l) => l.unitId === unitId);
      }
    }

    // Expiring within N days filter
    const expiringWithinDays = searchParams.get('expiring_within_days');
    if (expiringWithinDays) {
      const days = Number(expiringWithinDays);
      if (Number.isInteger(days) && days > 0) {
        leaseRecords = getExpiringLeases(leaseRecords, days);
      }
    }

    // Leases v3: residents (and, for managers, deposits) ride along with each
    // lease, fetched ONLY for the rows that survived the party filter.
    const visibleIds = new Set(leaseRecords.map((l) => l.id));
    const residentRows = await listLeaseResidentsForLeases(communityId, [...visibleIds]);
    const contactIds = [...new Set(residentRows.map((r) => r.contactId).filter((id): id is number => id != null))];
    const contacts = contactIds.length > 0 ? await listResidentContactsByIds(communityId, contactIds) : [];
    const contactsById = new Map(contacts.map((c) => [c.id, c]));
    const depositsByLease = new Map<number, LeaseDepositRow[]>();
    if (seesAllLeases && visibleIds.size > 0) {
      for (const d of await listLeaseDeposits(communityId, [...visibleIds])) {
        depositsByLease.set(d.leaseId, [...(depositsByLease.get(d.leaseId) ?? []), d]);
      }
    }

    return leaseRecords.map((l) => ({
      ...l,
      residents: residentsView(l.id, residentRows, contactsById, seesAllLeases),
      ...(seesAllLeases ? { deposits: depositsByLease.get(l.id) ?? [] } : {}),
    }));
  }),
);

// ---------------------------------------------------------------------------
// POST — Create a new lease
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(
  runRoute(leasesPostContract, async ({ body: payload, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();

    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireApartmentCommunity(membership.communityType);
    // AZ-01: the apartment gate says this COMMUNITY tracks leases, not that this
    // CALLER may write them. Minting a lease is a units-tier administrative
    // action, so gate on units:write (the manager row only) and do it before
    // any read, write or audit side effect below.
    requirePermission(membership, 'units', 'write');

    return createLease({ communityId, actorUserId, communityType: membership.communityType }, payload);
  }),
);

// ---------------------------------------------------------------------------
// PATCH — Update a lease (status change, rent update, move-out, etc.)
// ---------------------------------------------------------------------------

const PATCHABLE_FIELDS = [
  'status',
  'endDate',
  'rentAmount',
  'notes',
  'zeroRentReason',
  'zeroRentNote',
  'noticeDays',
  'moveOutOn',
  'endVia',
  'endReason',
  'noticeReceivedOn',
  'cancelledReason',
  'signedDocumentId',
] as const;

export const PATCH = withErrorHandler(
  runRoute(leasesPatchContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();

    const { id, communityId: _communityId, version: expectedVersion, ...fields } = body;
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireApartmentCommunity(membership.communityType);
    // AZ-01: units:write (manager row only) — rewriting someone else's lease
    // terms (rent, dates, status) is exactly as administrative as creating one.
    requirePermission(membership, 'units', 'write');

    // Find the existing lease
    const existing = await getLeaseById(communityId, id);
    if (!existing) {
      throw new NotFoundError('Lease not found');
    }
    const today = communityToday(membership.timezone);

    const updateData: Record<string, unknown> = {};
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    for (const key of PATCHABLE_FIELDS) {
      if (fields[key] === undefined) continue;
      updateData[key] = fields[key];
      oldValues[key] = existing[key] ?? null;
      newValues[key] = fields[key];
    }

    if (Object.keys(updateData).length === 0) {
      throw new ValidationError('No fields to update');
    }

    if (fields.endDate !== undefined) {
      validateLeaseDateWindow((existing['startDate'] as string) ?? '', fields.endDate);
    }

    // ── Cancelling a lease that never started (E1) ─────────────────────────
    if (fields.status === 'cancelled') {
      if ((existing['startDate'] as string) <= today) {
        throw new ValidationError('Only a lease that has not started yet can be cancelled. End it instead.');
      }
      if (!fields.cancelledReason) {
        throw new ValidationError('cancelledReason is required to cancel a lease');
      }
      await ensureNoUnpaidObligations(communityId, id, 'cancel this lease');
    } else if (fields.cancelledReason !== undefined) {
      throw new ValidationError('cancelledReason is only allowed when cancelling a lease');
    }

    // ── Scheduling or clearing a move-out ──────────────────────────────────
    const allRows = await listLeasesForCommunity(communityId);
    const allLeases = allRows as unknown as LeaseLikeRow[];
    if (fields.moveOutOn !== undefined) {
      if (fields.moveOutOn === null) {
        // Clearing a move-out. Refuse while a pre-lease (not this lease's own
        // renewal) was booked on the strength of it — the unit would be
        // double-booked. The prototype's "cancel the upcoming lease first".
        const blocking = allLeases.find(
          (l) =>
            l.unitId === existing['unitId'] &&
            l.id !== id &&
            l.status === 'active' &&
            l.previousLeaseId !== id &&
            l.startDate > today &&
            l.startDate > (existing['startDate'] as string) &&
            (existing['endDate'] == null || l.startDate <= (existing['endDate'] as string)),
        );
        if (blocking) {
          throw new ConflictError('Cancel the upcoming lease on this unit before cancelling the move-out.', {
            upcomingLeaseId: blocking.id,
          });
        }
        for (const k of ['endVia', 'endReason', 'noticeReceivedOn'] as const) {
          if (fields[k] === undefined) {
            updateData[k] = null;
            oldValues[k] = existing[k] ?? null;
            newValues[k] = null;
          }
        }
      } else {
        if (fields.moveOutOn < (existing['startDate'] as string)) {
          throw new ValidationError('moveOutOn cannot be before the lease start date');
        }
        const endVia = fields.endVia ?? (existing['endVia'] as string | null);
        if (!endVia) {
          throw new ValidationError('endVia is required when scheduling a move-out');
        }
        const endDate = (fields.endDate !== undefined ? fields.endDate : existing['endDate']) as string | null;
        if (endVia === 'early' && endDate && fields.moveOutOn > endDate) {
          throw new ValidationError('An early end must be on or before the lease end date');
        }
      }
    }

    // ── Rent: $0 needs a reason ────────────────────────────────────────────
    const nextRent = (fields.rentAmount !== undefined ? fields.rentAmount : existing['rentAmount']) as string | null;
    const nextZeroReason =
      fields.zeroRentReason !== undefined ? fields.zeroRentReason : (existing['zeroRentReason'] as string | null);
    if (isZeroRent(nextRent) && !nextZeroReason) {
      throw new ValidationError('A $0 rent needs a reason (zeroRentReason)');
    }
    if (!isZeroRent(nextRent) && fields.rentAmount !== undefined && existing['zeroRentReason']) {
      updateData['zeroRentReason'] = null;
      updateData['zeroRentNote'] = null;
    }

    const candidateEndDate =
      fields.endDate !== undefined ? fields.endDate : ((existing['endDate'] as string | null) ?? null);
    const candidateMoveOut =
      fields.moveOutOn !== undefined ? fields.moveOutOn : ((existing['moveOutOn'] as string | null) ?? null);
    if (fields.status !== 'cancelled') {
      ensureNoUnitLeaseOverlap(
        {
          id,
          unitId: existing['unitId'] as number,
          startDate: existing['startDate'] as string,
          endDate: effectiveEndDate({ endDate: candidateEndDate, moveOutOn: candidateMoveOut }),
        },
        allLeases,
      );
    }

    const renewalLease = allLeases.find((row) => row.previousLeaseId === id && row.status === 'active');
    if (renewalLease && candidateEndDate && fields.endDate !== undefined) {
      const residentRows = await listLeaseResidentsForLeases(communityId, [renewalLease.id, id]);
      ensureRenewalContinuity(
        {
          unitId: renewalLease.unitId,
          residentUserIds: residentUserIdsFor(renewalLease, residentRows),
          startDate: renewalLease.startDate,
          previousLeaseId: id,
        },
        {
          id,
          unitId: existing['unitId'] as number,
          residentId: (existing['residentId'] as string | null) ?? null,
          startDate: existing['startDate'] as string,
          endDate: candidateEndDate,
          status: (existing['status'] as string) ?? 'active',
          previousLeaseId: (existing['previousLeaseId'] as number | null) ?? null,
        },
        residentUserIdsFor({ id, residentId: (existing['residentId'] as string | null) ?? null }, residentRows),
      );
    }

    updateData['updatedBy'] = actorUserId;
    let updated;
    if (expectedVersion !== undefined) {
      updated = await updateLeaseIfVersion(communityId, id, expectedVersion, updateData);
      if (!updated) {
        throw new ConflictError('This lease changed since you opened it. Reload to see the latest version.', {
          expectedVersion,
          currentVersion: existing['version'] ?? null,
        });
      }
    } else {
      updated = await updateLeaseForCommunity(communityId, id, {
        ...updateData,
        version: ((existing['version'] as number | undefined) ?? 1) + 1,
      });
    }

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'lease',
      resourceId: String(id),
      communityId,
      oldValues,
      newValues,
    });

    // Best-effort: auto-create move-out checklist when lease is terminated
    if (fields.status === 'terminated' && membership.communityType === 'apartment' && existing['residentId']) {
      try {
        await createMoveChecklist(
          {
            communityId,
            leaseId: id,
            unitId: existing['unitId'] as number,
            residentId: existing['residentId'] as string,
            type: 'move_out',
          },
          actorUserId,
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[leases] auto-create move-out checklist failed', {
          communityId,
          leaseId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return updated;
  }),
);

// ---------------------------------------------------------------------------
// DELETE — Soft-delete a lease
// ---------------------------------------------------------------------------

export const DELETE = withErrorHandler(
  runRoute(leasesDeleteContract, async ({ query, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();

    await assertNotDemoGrace(communityId);
    const { id } = query;
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireApartmentCommunity(membership.communityType);
    // AZ-01: same units:write gate as POST/PATCH — soft-deleting someone else's
    // lease is a management-tier action, and it must be refused before the row
    // is read or touched.
    requirePermission(membership, 'units', 'write');

    // Verify lease exists
    const existing = await getLeaseById(communityId, id);
    if (!existing) {
      throw new NotFoundError('Lease not found');
    }

    // D9: deleting is for "entered by mistake" — never a way to make owed rent
    // disappear. Refuse while charges are outstanding.
    await ensureNoUnpaidObligations(communityId, id, 'delete this lease');

    await softDeleteLeaseForCommunity(communityId, id);

    await logAuditEvent({
      userId: actorUserId,
      action: 'delete',
      resourceType: 'lease',
      resourceId: String(id),
      communityId,
      oldValues: {
        unitId: existing['unitId'],
        residentId: existing['residentId'],
        status: existing['status'],
      },
    });

    return { deleted: true as const, id };
  }),
);
