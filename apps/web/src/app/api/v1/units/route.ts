/**
 * Units CRUD API — manages units within a community post-onboarding.
 *
 * Plan A1 drain #136. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and auth-chain rationale.
 */
import { runRoute } from '@propertypro/api-contract';
import { createScopedClient, logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';
import {
  createUnitForCommunity,
  getUnitById,
  getUnitByNumber,
  listResidentRolesForUnit,
  listUnitsForCommunity,
  softDeleteUnitById,
  updateUnitById,
} from '@/lib/services/unit-service';
import {
  unitsCreateContract,
  unitsDeleteContract,
  unitsListContract,
  unitsUpdateContract,
} from './contract';

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

function mapUnitRow(row: Record<string, unknown>) {
  return {
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
  };
}

export const GET = withErrorHandler(
  runRoute(unitsListContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'units', 'read');
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);
    const scoped = createScopedClient(communityId);

    const rows = await listUnitsForCommunity(scoped);
    return (rows as Record<string, unknown>[]).map(mapUnitRow);
  }),
);

export const POST = withErrorHandler(
  runRoute(unitsCreateContract, async ({ body, req }) => {
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'units', 'write');
    await requireActiveSubscriptionForMutation(communityId);
    const scoped = createScopedClient(communityId);

    const { unitNumber, building, floor, bedrooms, bathrooms, sqft } = body;
    const rentAmount = normalizeRentAmount(body.rentAmount);
    if (rentAmount !== undefined) {
      requireApartmentCommunityForRent(membership.communityType);
    }

    const duplicate = await getUnitByNumber(scoped, unitNumber);
    if (duplicate) {
      throw new ValidationError(`Unit number "${unitNumber}" already exists in this community`);
    }

    const newUnit = await createUnitForCommunity(scoped, {
      unitNumber,
      building: building ?? null,
      floor: floor ?? null,
      bedrooms: bedrooms ?? null,
      bathrooms: bathrooms ?? null,
      sqft: sqft ?? null,
      rentAmount: rentAmount ?? null,
    });
    if (!newUnit) {
      throw new Error('Failed to create unit');
    }

    await logAuditEvent({
      userId: actorUserId,
      action: 'create',
      resourceType: 'unit',
      resourceId: String(newUnit['id']),
      communityId,
      newValues: { unitNumber, building, floor, bedrooms, bathrooms, sqft, rentAmount },
    });

    void tryAutoComplete(communityId, actorUserId, 'add_units');

    return {
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
    };
  }),
);

export const PATCH = withErrorHandler(
  runRoute(unitsUpdateContract, async ({ body, req }) => {
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const { unitId, unitNumber, building, floor, bedrooms, bathrooms, sqft } = body;
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'units', 'write');
    await requireActiveSubscriptionForMutation(communityId);
    const scoped = createScopedClient(communityId);
    const rentAmount = normalizeRentAmount(body.rentAmount);
    if (rentAmount !== undefined) {
      requireApartmentCommunityForRent(membership.communityType);
      throw new ValidationError(
        'Update lease rentAmount via /api/v1/leases. Unit rentAmount is derived to prevent rent drift.',
      );
    }

    const existing = await getUnitById(scoped, unitId);

    if (!existing) {
      throw new NotFoundError(`Unit ${unitId} not found in community ${communityId}`);
    }

    if (unitNumber !== undefined) {
      const duplicate = await getUnitByNumber(scoped, unitNumber);
      if (duplicate && (duplicate['id'] as number) !== unitId) {
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

    await updateUnitById(scoped, unitId, updateData);

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'unit',
      resourceId: String(unitId),
      communityId,
      oldValues,
      newValues,
    });

    return {
      id: unitId,
      communityId,
      unitNumber: unitNumber ?? (existing['unitNumber'] as string),
      building: building !== undefined ? (building ?? null) : (existing['building'] as string | null),
      floor: floor !== undefined ? (floor ?? null) : (existing['floor'] as number | null),
      bedrooms: bedrooms !== undefined ? (bedrooms ?? null) : (existing['bedrooms'] as number | null),
      bathrooms: bathrooms !== undefined ? (bathrooms ?? null) : (existing['bathrooms'] as number | null),
      sqft: sqft !== undefined ? (sqft ?? null) : (existing['sqft'] as number | null),
      rentAmount: rentAmount !== undefined ? (rentAmount ?? null) : (existing['rentAmount'] as string | null),
    };
  }),
);

export const DELETE = withErrorHandler(
  runRoute(unitsDeleteContract, async ({ body, req }) => {
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const { unitId } = body;
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'units', 'write');
    await requireActiveSubscriptionForMutation(communityId);
    const scoped = createScopedClient(communityId);

    const existing = await getUnitById(scoped, unitId);

    if (!existing) {
      throw new NotFoundError(`Unit ${unitId} not found in community ${communityId}`);
    }

    const activeResidents = await listResidentRolesForUnit(scoped, unitId);

    if (activeResidents.length > 0) {
      throw new ValidationError(
        `Cannot delete unit ${unitId}: ${activeResidents.length} active resident(s) are still assigned. Reassign or remove them first.`,
      );
    }

    await softDeleteUnitById(scoped, unitId);

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

    return { success: true as const };
  }),
);
