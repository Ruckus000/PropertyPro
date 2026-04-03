/**
 * Units CRUD API — manages units within a community post-onboarding.
 *
 * GET    /api/v1/units?communityId=N  — list all units for a community
 * POST   /api/v1/units               — create a new unit
 * PATCH  /api/v1/units               — update an existing unit
 * DELETE /api/v1/units               — soft-delete a unit
 *
 * All routes use:
 * - withErrorHandler (AGENTS #43)
 * - createScopedClient for tenant isolation (AGENTS #7, #14)
 * - logAuditEvent for mutations (P1-27)
 * - Zod validation
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  logAuditEvent,
  units,
  userRoles,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requirePermission } from '@/lib/db/access-control';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';

const communityIdSchema = z.coerce.number().int().positive();

const createUnitSchema = z.object({
  communityId: z.number().int().positive(),
  unitNumber: z.string().min(1, 'Unit number is required'),
  building: z.string().nullable().optional(),
  floor: z.number().int().nullable().optional(),
  bedrooms: z.number().int().min(0).nullable().optional(),
  bathrooms: z.number().int().min(0).nullable().optional(),
  sqft: z.number().int().min(0).nullable().optional(),
  rentAmount: z.string().nullable().optional(),
});

const updateUnitSchema = z.object({
  communityId: z.number().int().positive(),
  unitId: z.number().int().positive(),
  unitNumber: z.string().min(1).optional(),
  building: z.string().nullable().optional(),
  floor: z.number().int().nullable().optional(),
  bedrooms: z.number().int().min(0).nullable().optional(),
  bathrooms: z.number().int().min(0).nullable().optional(),
  sqft: z.number().int().min(0).nullable().optional(),
  rentAmount: z.string().nullable().optional(),
});

const deleteUnitSchema = z.object({
  communityId: z.number().int().positive(),
  unitId: z.number().int().positive(),
});

function normalizeRentAmount(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

function requireApartmentCommunityForRent(communityType: string): void {
  if (communityType !== 'apartment') {
    throw new ValidationError('Unit rentAmount is only available for apartment communities');
  }
}

// ---------------------------------------------------------------------------
// GET — list units for a community
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const rawCommunityId = searchParams.get('communityId');

  const communityIdResult = communityIdSchema.safeParse(rawCommunityId);
  if (!communityIdResult.success) {
    throw new ValidationError('Invalid or missing communityId query parameter', {
      fields: formatZodErrors(communityIdResult.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, communityIdResult.data);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requirePermission(membership, 'units', 'read');
  const scoped = createScopedClient(communityId);

  const rows = await scoped.query(units);

  const data = (rows as Record<string, unknown>[]).map((row) => ({
    id: row['id'] as number,
    communityId: row['communityId'] as number,
    unitNumber: row['unitNumber'] as string,
    building: (row['building'] as string | null) ?? null,
    floor: (row['floor'] as number | null) ?? null,
    bedrooms: (row['bedrooms'] as number | null) ?? null,
    bathrooms: (row['bathrooms'] as number | null) ?? null,
    sqft: (row['sqft'] as number | null) ?? null,
    rentAmount: (row['rentAmount'] as string | null) ?? null,
    ownerUserId: (row['ownerUserId'] as string | null) ?? null,
    createdAt: row['createdAt'] as string,
    updatedAt: row['updatedAt'] as string,
  }));

  return NextResponse.json({ data });
});

// ---------------------------------------------------------------------------
// POST — create a new unit
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parseResult = createUnitSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Validation failed', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, parseResult.data.communityId);
  await assertNotDemoGrace(communityId);
  const actorUserId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requirePermission(membership, 'units', 'write');
  await requireActiveSubscriptionForMutation(communityId);
  const scoped = createScopedClient(communityId);

  const { unitNumber, building, floor, bedrooms, bathrooms, sqft } = parseResult.data;
  const rentAmount = normalizeRentAmount(parseResult.data.rentAmount);
  if (rentAmount !== undefined) {
    requireApartmentCommunityForRent(membership.communityType);
  }

  // Check for duplicate unit number within the community
  const existingUnits = await scoped.query(units);
  const duplicate = (existingUnits as Record<string, unknown>[]).find(
    (row) => (row['unitNumber'] as string) === unitNumber,
  );
  if (duplicate) {
    throw new ValidationError(`Unit number "${unitNumber}" already exists in this community`);
  }

  const inserted = await scoped.insert(units, {
    unitNumber,
    building: building ?? null,
    floor: floor ?? null,
    bedrooms: bedrooms ?? null,
    bathrooms: bathrooms ?? null,
    sqft: sqft ?? null,
    rentAmount: rentAmount ?? null,
  });

  const newUnit = inserted[0] as Record<string, unknown>;

  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'unit',
    resourceId: String(newUnit['id']),
    communityId,
    newValues: { unitNumber, building, floor, bedrooms, bathrooms, sqft, rentAmount },
  });

  void tryAutoComplete(communityId, actorUserId, 'add_units');

  return NextResponse.json(
    {
      data: {
        id: newUnit['id'] as number,
        communityId,
        unitNumber,
        building: building ?? null,
        floor: floor ?? null,
        bedrooms: bedrooms ?? null,
        bathrooms: bathrooms ?? null,
        sqft: sqft ?? null,
        rentAmount: rentAmount ?? null,
        ownerUserId: null,
        createdAt: newUnit['createdAt'] as string,
        updatedAt: newUnit['updatedAt'] as string,
      },
    },
    { status: 201 },
  );
});

// ---------------------------------------------------------------------------
// PATCH — update an existing unit
// ---------------------------------------------------------------------------

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parseResult = updateUnitSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Validation failed', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, parseResult.data.communityId);
  await assertNotDemoGrace(communityId);
  const { unitId, unitNumber, building, floor, bedrooms, bathrooms, sqft } = parseResult.data;
  const actorUserId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requirePermission(membership, 'units', 'write');
  await requireActiveSubscriptionForMutation(communityId);
  const scoped = createScopedClient(communityId);
  const rentAmount = normalizeRentAmount(parseResult.data.rentAmount);
  if (rentAmount !== undefined) {
    requireApartmentCommunityForRent(membership.communityType);
    throw new ValidationError(
      'Update lease rentAmount via /api/v1/leases. Unit rentAmount is derived to prevent rent drift.',
    );
  }

  // Find the existing unit
  const allUnits = await scoped.query(units);
  const existing = (allUnits as Record<string, unknown>[]).find(
    (row) => (row['id'] as number) === unitId,
  );

  if (!existing) {
    throw new NotFoundError(`Unit ${unitId} not found in community ${communityId}`);
  }

  // Check for duplicate unit number if changing it
  if (unitNumber !== undefined) {
    const duplicate = (allUnits as Record<string, unknown>[]).find(
      (row) => (row['unitNumber'] as string) === unitNumber && (row['id'] as number) !== unitId,
    );
    if (duplicate) {
      throw new ValidationError(`Unit number "${unitNumber}" already exists in this community`);
    }
  }

  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  const updateData: Record<string, unknown> = {};

  const fields = [
    ['unitNumber', unitNumber],
    ['building', building],
    ['floor', floor],
    ['bedrooms', bedrooms],
    ['bathrooms', bathrooms],
    ['sqft', sqft],
    ['rentAmount', rentAmount],
  ] as const;

  for (const [key, value] of fields) {
    if (value !== undefined) {
      oldValues[key] = existing[key] ?? null;
      newValues[key] = value ?? null;
      updateData[key] = value ?? null;
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw new ValidationError('No fields to update');
  }

  updateData['updatedAt'] = new Date();

  await scoped.update(units, updateData, eq(units.id, unitId));

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'unit',
    resourceId: String(unitId),
    communityId,
    oldValues,
    newValues,
  });

  return NextResponse.json({
    data: {
      id: unitId,
      communityId,
      unitNumber: unitNumber ?? (existing['unitNumber'] as string),
      building: building !== undefined ? (building ?? null) : (existing['building'] as string | null),
      floor: floor !== undefined ? (floor ?? null) : (existing['floor'] as number | null),
      bedrooms: bedrooms !== undefined ? (bedrooms ?? null) : (existing['bedrooms'] as number | null),
      bathrooms: bathrooms !== undefined ? (bathrooms ?? null) : (existing['bathrooms'] as number | null),
      sqft: sqft !== undefined ? (sqft ?? null) : (existing['sqft'] as number | null),
      rentAmount: rentAmount !== undefined ? (rentAmount ?? null) : (existing['rentAmount'] as string | null),
    },
  });
});

// ---------------------------------------------------------------------------
// DELETE — soft-delete a unit
// ---------------------------------------------------------------------------

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parseResult = deleteUnitSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Validation failed', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, parseResult.data.communityId);
  await assertNotDemoGrace(communityId);
  const { unitId } = parseResult.data;
  const actorUserId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requirePermission(membership, 'units', 'write');
  await requireActiveSubscriptionForMutation(communityId);
  const scoped = createScopedClient(communityId);

  // Find the existing unit
  const allUnits = await scoped.query(units);
  const existing = (allUnits as Record<string, unknown>[]).find(
    (row) => (row['id'] as number) === unitId,
  );

  if (!existing) {
    throw new NotFoundError(`Unit ${unitId} not found in community ${communityId}`);
  }

  // Check for active residents assigned to this unit
  const roleRows = await scoped.query(userRoles);
  const activeResidents = (roleRows as Record<string, unknown>[]).filter(
    (row) => (row['unitId'] as number | null) === unitId,
  );

  if (activeResidents.length > 0) {
    throw new ValidationError(
      `Cannot delete unit ${unitId}: ${activeResidents.length} active resident(s) are still assigned. Reassign or remove them first.`,
    );
  }

  // Soft-delete the unit
  await scoped.softDelete(units, eq(units.id, unitId));

  await logAuditEvent({
    userId: actorUserId,
    action: 'delete',
    resourceType: 'unit',
    resourceId: String(unitId),
    communityId,
    oldValues: {
      unitNumber: existing['unitNumber'],
      building: existing['building'],
      floor: existing['floor'],
    },
  });

  return NextResponse.json({ data: { success: true } });
});
