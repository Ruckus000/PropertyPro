/**
 * Leases API — CRUD operations with expiration tracking and renewal chain (P2-37).
 *
 * Patterns:
 * - withErrorHandler for structured error responses
 * - createScopedClient for tenant isolation (AGENTS #13)
 * - logAuditEvent on every mutation
 * - Zod validation on request bodies
 * - Apartment-only feature gate (AGENTS #34)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  logAuditEvent,
  leases,
  units,
  userRoles,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { getFeaturesForCommunity, type CommunityType } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError, NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import {
  getExpiringLeases,
  getRenewalChain,
  type LeaseRecord,
} from '@/lib/services/lease-expiration-service';
import { createMoveChecklist } from '@/lib/services/move-checklist-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const leaseStatusValues = ['active', 'expired', 'renewed', 'terminated'] as const;

const createLeaseSchema = z.object({
  communityId: z.number().int().positive(),
  unitId: z.number().int().positive(),
  residentId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format')
    .nullable()
    .optional(),
  rentAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a decimal number with up to 2 decimal places')
    .nullable()
    .optional(),
  status: z.enum(leaseStatusValues).optional(),
  previousLeaseId: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  /** When true, creating a renewal: sets previousLeaseId and marks old lease as 'renewed' */
  isRenewal: z.boolean().optional(),
});

const updateLeaseSchema = z.object({
  id: z.number().int().positive(),
  communityId: z.number().int().positive(),
  status: z.enum(leaseStatusValues).optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format')
    .nullable()
    .optional(),
  rentAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a decimal number with up to 2 decimal places')
    .nullable()
    .optional(),
  notes: z.string().nullable().optional(),
});

const deleteLeaseSchema = z.object({
  id: z.number().int().positive(),
  communityId: z.number().int().positive(),
});

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

function coerceLeaseRecord(row: Record<string, unknown>): LeaseRecord {
  return {
    id: row['id'] as number,
    communityId: row['communityId'] as number,
    unitId: row['unitId'] as number,
    residentId: row['residentId'] as string,
    startDate: row['startDate'] as string,
    endDate: (row['endDate'] as string | null) ?? null,
    rentAmount: (row['rentAmount'] as string | null) ?? null,
    status: row['status'] as string,
    previousLeaseId: (row['previousLeaseId'] as number | null) ?? null,
    notes: (row['notes'] as string | null) ?? null,
  };
}

type LeaseLikeRow = {
  id: number;
  unitId: number;
  residentId: string;
  startDate: string;
  endDate: string | null;
  status: string;
  previousLeaseId: number | null;
};

function parseIsoDateOnly(value: string, fieldName: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid date in YYYY-MM-DD format`);
  }
  return parsed;
}

function isFirstDayOfMonth(value: string): boolean {
  return value.endsWith('-01');
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function dateRangesOverlap(
  startA: Date,
  endA: Date | null,
  startB: Date,
  endB: Date | null,
): boolean {
  const aEnd = endA ?? new Date('9999-12-31T00:00:00.000Z');
  const bEnd = endB ?? new Date('9999-12-31T00:00:00.000Z');
  return startA <= bEnd && startB <= aEnd;
}

function validateLeaseDateWindow(startDate: string, endDate: string | null): void {
  if (!isFirstDayOfMonth(startDate)) {
    throw new ValidationError('Lease startDate must be the first day of the month (YYYY-MM-01)');
  }
  const start = parseIsoDateOnly(startDate, 'startDate');
  if (endDate) {
    const end = parseIsoDateOnly(endDate, 'endDate');
    if (end <= start) {
      throw new ValidationError('endDate must be after startDate');
    }
  }
}

function ensureNoUnitLeaseOverlap(
  candidate: { id?: number; unitId: number; startDate: string; endDate: string | null },
  existingLeases: LeaseLikeRow[],
): void {
  const candidateStart = parseIsoDateOnly(candidate.startDate, 'startDate');
  const candidateEnd = candidate.endDate ? parseIsoDateOnly(candidate.endDate, 'endDate') : null;
  const overlaps = existingLeases.some((existing) => {
    if (candidate.id !== undefined && existing.id === candidate.id) return false;
    if (existing.unitId !== candidate.unitId) return false;
    if (existing.status === 'terminated') return false;
    const existingStart = parseIsoDateOnly(existing.startDate, 'startDate');
    const existingEnd = existing.endDate ? parseIsoDateOnly(existing.endDate, 'endDate') : null;
    return dateRangesOverlap(candidateStart, candidateEnd, existingStart, existingEnd);
  });
  if (overlaps) {
    throw new ValidationError('Lease period overlaps an existing lease for this unit');
  }
}

function ensureRenewalContinuity(
  candidate: { unitId: number; residentId: string; startDate: string; previousLeaseId: number },
  previousLease: LeaseLikeRow,
): void {
  if (previousLease.unitId !== candidate.unitId) {
    throw new ValidationError('Renewal lease must use the same unit as the previous lease');
  }
  if (previousLease.residentId !== candidate.residentId) {
    throw new ValidationError('Renewal lease must use the same resident as the previous lease');
  }
  if (!previousLease.endDate) {
    throw new ValidationError('Previous lease must have an endDate before creating a renewal');
  }

  const previousEndDate = parseIsoDateOnly(previousLease.endDate, 'previousLease.endDate');
  const expectedStartDate = addDays(previousEndDate, 1);
  const actualStartDate = parseIsoDateOnly(candidate.startDate, 'startDate');
  if (actualStartDate.getTime() !== expectedStartDate.getTime()) {
    throw new ValidationError('Renewal lease startDate must be the day after the previous lease endDate');
  }
}

// ---------------------------------------------------------------------------
// GET — List leases for a community with optional filters
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);

  const rawCommunityId = searchParams.get('communityId');
  if (!rawCommunityId) {
    throw new ValidationError('communityId query parameter is required');
  }

  const parsedCommunityId = Number(rawCommunityId);
  if (!Number.isInteger(parsedCommunityId) || parsedCommunityId <= 0) {
    throw new ValidationError('communityId must be a positive integer');
  }

  const communityId = resolveEffectiveCommunityId(req, parsedCommunityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireApartmentCommunity(membership.communityType);

  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(leases);
  let leaseRecords = rows.map(coerceLeaseRecord);

  // Optional filters
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

  // If requesting a specific lease's renewal chain
  const chainFor = searchParams.get('renewal_chain_for');
  if (chainFor) {
    const leaseId = Number(chainFor);
    if (Number.isInteger(leaseId) && leaseId > 0) {
      // Need all leases (not just active) for chain traversal
      const allRows = await scoped.query(leases);
      const allLeases = allRows.map(coerceLeaseRecord);
      const chain = getRenewalChain(leaseId, allLeases);
      return NextResponse.json({ data: chain });
    }
  }

  return NextResponse.json({ data: leaseRecords });
});

// ---------------------------------------------------------------------------
// POST — Create a new lease
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();

  const body: unknown = await req.json();
  const parseResult = createLeaseSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid lease payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const payload = parseResult.data;
  const communityId = resolveEffectiveCommunityId(req, payload.communityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireApartmentCommunity(membership.communityType);

  const scoped = createScopedClient(communityId);

  // Validate unit belongs to this community
  const unitRows = await scoped.query(units);
  const unit = unitRows.find((row) => row['id'] === payload.unitId);
  if (!unit) {
    throw new ValidationError('Unit not found in this community');
  }
  const unitRentAmount = (unit['rentAmount'] as string | null) ?? null;

  // Validate resident has a tenant (non-owner resident) role in this community
  const roleRows = await scoped.query(userRoles);
  const residentRole = roleRows.find(
    (row) => row['userId'] === payload.residentId && row['role'] === 'resident' && row['isUnitOwner'] !== true,
  );
  if (!residentRole) {
    throw new ValidationError('Resident must have a tenant role in this community');
  }

  validateLeaseDateWindow(payload.startDate, payload.endDate ?? null);

  const existingLeaseRows = await scoped.query(leases);
  const existingLeases = existingLeaseRows as unknown as LeaseLikeRow[];
  ensureNoUnitLeaseOverlap(
    {
      unitId: payload.unitId,
      startDate: payload.startDate,
      endDate: payload.endDate ?? null,
    },
    existingLeases,
  );

  const effectiveRentAmount = payload.rentAmount ?? unitRentAmount;

  // Handle renewal logic
  let previousLeaseId = payload.previousLeaseId ?? null;
  if (payload.isRenewal || previousLeaseId !== null) {
    if (!previousLeaseId) {
      throw new ValidationError('previousLeaseId is required when creating a renewal lease');
    }
    // Verify the previous lease exists in this community
    const previousLease = existingLeases.find((row) => row.id === previousLeaseId);
    if (!previousLease) {
      throw new ValidationError('Previous lease not found in this community');
    }
    ensureRenewalContinuity(
      {
        unitId: payload.unitId,
        residentId: payload.residentId,
        startDate: payload.startDate,
        previousLeaseId,
      },
      previousLease,
    );

    // Mark the previous lease as 'renewed'
    await scoped.update(leases, { status: 'renewed' }, eq(leases.id, previousLeaseId));

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'lease',
      resourceId: String(previousLeaseId),
      communityId,
      oldValues: { status: previousLease['status'] },
      newValues: { status: 'renewed' },
      metadata: { reason: 'renewal' },
    });
  }

  const insertedRows = await scoped.insert(leases, {
    unitId: payload.unitId,
    residentId: payload.residentId,
    startDate: payload.startDate,
    endDate: payload.endDate ?? null,
    rentAmount: effectiveRentAmount,
    status: payload.status ?? 'active',
    previousLeaseId,
    notes: payload.notes ?? null,
  });

  const created = insertedRows[0];
  if (!created) {
    throw new ValidationError('Failed to create lease');
  }

  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'lease',
    resourceId: String(created['id']),
    communityId,
    newValues: {
      unitId: payload.unitId,
      residentId: payload.residentId,
      startDate: payload.startDate,
      endDate: payload.endDate ?? null,
      rentAmount: effectiveRentAmount,
      status: payload.status ?? 'active',
      previousLeaseId,
    },
  });

  // Best-effort: auto-create move-in checklist for apartment communities
  if (membership.communityType === 'apartment') {
    try {
      await createMoveChecklist(
        {
          communityId,
          leaseId: created['id'] as number,
          unitId: payload.unitId,
          residentId: payload.residentId,
          type: 'move_in',
        },
        actorUserId,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[leases] auto-create move-in checklist failed', {
        communityId,
        leaseId: created['id'],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ data: created }, { status: 201 });
});

// ---------------------------------------------------------------------------
// PATCH — Update a lease (status change, rent update, etc.)
// ---------------------------------------------------------------------------

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();

  const body: unknown = await req.json();
  const parseResult = updateLeaseSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid update payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const { id, communityId: rawCommunityId, ...fields } = parseResult.data;
  const communityId = resolveEffectiveCommunityId(req, rawCommunityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireApartmentCommunity(membership.communityType);

  const scoped = createScopedClient(communityId);

  // Find the existing lease
  const existingRows = await scoped.query(leases);
  const existing = existingRows.find((row) => row['id'] === id);
  if (!existing) {
    throw new NotFoundError('Lease not found');
  }

  const updateData: Record<string, unknown> = {};
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  if (fields.status !== undefined) {
    updateData['status'] = fields.status;
    oldValues['status'] = existing['status'];
    newValues['status'] = fields.status;
  }
  if (fields.endDate !== undefined) {
    validateLeaseDateWindow((existing['startDate'] as string) ?? '', fields.endDate);
    updateData['endDate'] = fields.endDate;
    oldValues['endDate'] = existing['endDate'];
    newValues['endDate'] = fields.endDate;
  }
  if (fields.rentAmount !== undefined) {
    updateData['rentAmount'] = fields.rentAmount;
    oldValues['rentAmount'] = existing['rentAmount'];
    newValues['rentAmount'] = fields.rentAmount;
  }
  if (fields.notes !== undefined) {
    updateData['notes'] = fields.notes;
    oldValues['notes'] = existing['notes'];
    newValues['notes'] = fields.notes;
  }

  if (Object.keys(updateData).length === 0) {
    throw new ValidationError('No fields to update');
  }

  const allRows = await scoped.query(leases);
  const allLeases = allRows as unknown as LeaseLikeRow[];
  const candidateEndDate =
    fields.endDate !== undefined ? fields.endDate : ((existing['endDate'] as string | null) ?? null);
  ensureNoUnitLeaseOverlap(
    {
      id,
      unitId: existing['unitId'] as number,
      startDate: existing['startDate'] as string,
      endDate: candidateEndDate,
    },
    allLeases,
  );

  const renewalLease = allLeases.find((row) => row.previousLeaseId === id);
  if (renewalLease && candidateEndDate) {
    ensureRenewalContinuity(
      {
        unitId: renewalLease.unitId,
        residentId: renewalLease.residentId,
        startDate: renewalLease.startDate,
        previousLeaseId: id,
      },
      {
        id,
        unitId: existing['unitId'] as number,
        residentId: existing['residentId'] as string,
        startDate: existing['startDate'] as string,
        endDate: candidateEndDate,
        status: (existing['status'] as string) ?? 'active',
        previousLeaseId: (existing['previousLeaseId'] as number | null) ?? null,
      },
    );
  }

  const [updated] = await scoped.update(leases, updateData, eq(leases.id, id));

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
  if (fields.status === 'terminated' && membership.communityType === 'apartment') {
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

  return NextResponse.json({ data: updated });
});

// ---------------------------------------------------------------------------
// DELETE — Soft-delete a lease
// ---------------------------------------------------------------------------

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();

  const { searchParams } = new URL(req.url);
  const parseResult = deleteLeaseSchema.safeParse({
    id: Number(searchParams.get('id')),
    communityId: Number(searchParams.get('communityId')),
  });

  if (!parseResult.success) {
    throw new ValidationError('Invalid delete request', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, parseResult.data.communityId);
  await assertNotDemoGrace(communityId);
  const { id } = parseResult.data;
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireApartmentCommunity(membership.communityType);

  const scoped = createScopedClient(communityId);

  // Verify lease exists
  const existingRows = await scoped.query(leases);
  const existing = existingRows.find((row) => row['id'] === id);
  if (!existing) {
    throw new NotFoundError('Lease not found');
  }

  await scoped.softDelete(leases, eq(leases.id, id));

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

  return NextResponse.json({ data: { deleted: true, id } });
});
