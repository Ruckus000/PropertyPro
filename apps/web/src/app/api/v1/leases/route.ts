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
import { eq } from 'drizzle-orm';
import {
  createScopedClient,
  logAuditEvent,
  leases,
  units,
  userRoles,
} from '@propertypro/db';
import { getFeaturesForCommunity } from '@propertypro/shared';
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
function requireApartmentCommunity(communityType: string): void {
  const features = getFeaturesForCommunity(communityType as Parameters<typeof getFeaturesForCommunity>[0]);
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
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireApartmentCommunity(membership.communityType);

  const scoped = createScopedClient(communityId);

  // Validate unit belongs to this community
  const unitRows = await scoped.query(units);
  const unit = unitRows.find((row) => row['id'] === payload.unitId);
  if (!unit) {
    throw new ValidationError('Unit not found in this community');
  }

  // Validate resident has a tenant role in this community
  const roleRows = await scoped.query(userRoles);
  const residentRole = roleRows.find(
    (row) => row['userId'] === payload.residentId && row['role'] === 'tenant',
  );
  if (!residentRole) {
    throw new ValidationError('Resident must have a tenant role in this community');
  }

  // Handle renewal logic
  let previousLeaseId = payload.previousLeaseId ?? null;
  if (payload.isRenewal && previousLeaseId) {
    // Verify the previous lease exists in this community
    const existingLeases = await scoped.query(leases);
    const previousLease = existingLeases.find((row) => row['id'] === previousLeaseId);
    if (!previousLease) {
      throw new ValidationError('Previous lease not found in this community');
    }

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
    rentAmount: payload.rentAmount ?? null,
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
      rentAmount: payload.rentAmount ?? null,
      status: payload.status ?? 'active',
      previousLeaseId,
    },
  });

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
