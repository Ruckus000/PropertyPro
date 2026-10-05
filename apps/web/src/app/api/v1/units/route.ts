/**
 * Units CRUD API — manages units within a community post-onboarding.
 *
 * Plan A1 drain #136. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and auth-chain rationale.
 */
import { runRoute } from '@propertypro/api-contract';
import { createScopedClient, logAuditEvent } from '@propertypro/db';
import { isAdminRole } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';
import { requireViolationsEnabled } from '@/lib/violations/common';
import { countOccupantsForUnit } from '@/lib/services/occupant-service';
import {
  countOpenViolationsForUnit,
  countOpenViolationsByUnit,
  createUnitForCommunity,
  getUnitBalanceCents,
  getUnitById,
  getUnitByNumber,
  listResidentRolesForUnit,
  listUnitsForCommunity,
  softDeleteUnitById,
  updateUnitById,
  unitNumberTaken,
} from '@/lib/services/unit-service';
import {
  unitsCreateContract,
  unitsDeleteContract,
  unitsListContract,
  unitsUpdateContract,
} from './contract';
import { apartmentOccupancyByUnit, type DerivedOccupancy } from '@/lib/leases/apartment-occupancy';

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

function assertOccupancyAllowed(occupancy: string | null | undefined, communityType: string): void {
  // Leases v3: an apartment unit's occupancy is derived from its leases
  // (lib/leases/apartment-occupancy), so a manual value — even null — is
  // refused rather than stored and silently ignored.
  if (occupancy !== undefined && communityType === 'apartment') {
    throw new ValidationError('Occupancy for apartments comes from leases');
  }
}

/** Where a unit's occupancy comes from: the manager (condo, HOA) or its leases (apartment). */
function occupancySourceFor(communityType: string): 'manual' | 'leases' {
  return communityType === 'apartment' ? 'leases' : 'manual';
}

/**
 * `rentAmount` is derived from the unit's active lease by a DB trigger (0040),
 * and `ownerUserId` identifies the owning user — both are per-unit records of
 * OTHER residents. `units.read` admits owners and tenants (the unit picker and
 * other resident features need the list), so the list must not carry them to a
 * non-manager: a tenant would otherwise read every neighbour's rent. Leases are
 * manager-only (AZ-01); this is the same data through a different door.
 * `occupancy` follows the same rule: which units stand vacant is not a
 * neighbour's business (it is a burglary map).
 */
function mapUnitRow(
  row: Record<string, unknown>,
  includeManagerFields: boolean,
  openViolations: ReadonlyMap<number, number> | null,
  /** Apartments: occupancy derived from leases, which replaces the stored column. */
  derivedOccupancy: ReadonlyMap<number, DerivedOccupancy> | null = null,
) {
  const derived = derivedOccupancy !== null;
  return {
    id: row['id'] as number,
    communityId: row['communityId'] as number,
    unitNumber: row['unitNumber'] as string,
    building: (row['building'] as string | null) ?? null,
    floor: (row['floor'] as number | null) ?? null,
    bedrooms: (row['bedrooms'] as number | null) ?? null,
    bathrooms: (row['bathrooms'] as number | null) ?? null,
    sqft: (row['sqft'] as number | null) ?? null,
    rentAmount: includeManagerFields ? ((row['rentAmount'] as string | null) ?? null) : null,
    ownerUserId: includeManagerFields ? ((row['ownerUserId'] as string | null) ?? null) : null,
    occupancy: !includeManagerFields
      ? null
      : derived
        ? (derivedOccupancy.get(row['id'] as number) ?? null)
        : ((row['occupancy'] as string | null) ?? null),
    // A derived value needs no confirming.
    occupancyConfirmed: includeManagerFields ? derived || row['occupancyConfirmedAt'] != null : false,
    occupancySource: derived ? ('leases' as const) : ('manual' as const),
    // Leases v3 (E7): out-of-service state. Manager-only like rent — the note
    // can say why a unit is empty.
    offlineReason: includeManagerFields ? ((row['offlineReason'] as string | null) ?? null) : null,
    offlineNote: includeManagerFields ? ((row['offlineNote'] as string | null) ?? null) : null,
    offlineSince: includeManagerFields ? ((row['offlineSince'] as string | null) ?? null) : null,
    offlineUntil: includeManagerFields ? ((row['offlineUntil'] as string | null) ?? null) : null,
    /** Open violations; null when the viewer may not see them (or the feature is off). */
    openViolations: openViolations ? (openViolations.get(row['id'] as number) ?? 0) : null,
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
    const includeManagerFields = isAdminRole(membership.role);
    // Violation counts: managers only (a neighbour's enforcement history is not
    // a resident's business), and only where violations are on for the
    // community type and plan — the same gate as /api/v1/violations.
    const violationsOn =
      includeManagerFields && (await requireViolationsEnabled(membership).then(() => true, () => false));
    const openViolations = violationsOn ? await countOpenViolationsByUnit(scoped) : null;
    // Apartments: one extra (status = active) lease read, managers only — a
    // non-manager gets no occupancy either way.
    const derivedOccupancy =
      occupancySourceFor(membership.communityType) === 'leases'
        ? includeManagerFields
          ? await apartmentOccupancyByUnit(communityId, rows as Record<string, unknown>[], membership.timezone)
          : new Map<number, DerivedOccupancy>()
        : null;
    return (rows as Record<string, unknown>[]).map((row) =>
      mapUnitRow(row, includeManagerFields, openViolations, derivedOccupancy),
    );
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

    const { unitNumber, building, floor, bedrooms, bathrooms, sqft, occupancy } = body;
    const rentAmount = normalizeRentAmount(body.rentAmount);
    if (rentAmount !== undefined) {
      requireApartmentCommunityForRent(membership.communityType);
    }
    assertOccupancyAllowed(occupancy, membership.communityType);

    const duplicate = await getUnitByNumber(scoped, unitNumber);
    if (duplicate) {
      throw unitNumberTaken(unitNumber);
    }

    const newUnit = await createUnitForCommunity(scoped, {
      unitNumber,
      building: building ?? null,
      floor: floor ?? null,
      bedrooms: bedrooms ?? null,
      bathrooms: bathrooms ?? null,
      sqft: sqft ?? null,
      rentAmount: rentAmount ?? null,
      // A value chosen by the manager on create is confirmed by definition.
      occupancy: occupancy ?? null,
      occupancyConfirmedAt: occupancy ? new Date() : null,
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
      newValues: { unitNumber, building, floor, bedrooms, bathrooms, sqft, rentAmount, occupancy },
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
      // A new apartment unit has no lease yet: vacant.
      ...(occupancySourceFor(membership.communityType) === 'leases'
        ? { occupancy: 'vacant', occupancyConfirmed: true, occupancySource: 'leases' as const }
        : { occupancy: occupancy ?? null, occupancyConfirmed: Boolean(occupancy), occupancySource: 'manual' as const }),
      createdAt: newUnit['createdAt'] as string,
      updatedAt: newUnit['updatedAt'] as string,
    };
  }),
);

export const PATCH = withErrorHandler(
  runRoute(unitsUpdateContract, async ({ body, req }) => {
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const { unitId, unitNumber, building, floor, bedrooms, bathrooms, sqft, occupancy } = body;
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

    assertOccupancyAllowed(occupancy, membership.communityType);

    const existing = await getUnitById(scoped, unitId);

    if (!existing) {
      throw new NotFoundError(`Unit ${unitId} not found in community ${communityId}`);
    }

    if (unitNumber !== undefined) {
      const duplicate = await getUnitByNumber(scoped, unitNumber);
      if (duplicate && (duplicate['id'] as number) !== unitId) {
        throw unitNumberTaken(unitNumber);
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
      ['occupancy', occupancy],
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

    // Any explicit occupancy write — including re-saving the backfilled guess
    // unchanged — is the manager confirming it. Clearing it un-confirms.
    if (occupancy !== undefined) {
      updateData['occupancyConfirmedAt'] = occupancy === null ? null : new Date();
    }

    updateData['updatedAt'] = new Date();

    const updated = await updateUnitById(scoped, unitId, updateData, body.expectedUpdatedAt);
    if (!updated) {
      throw new ConflictError('Someone else changed this unit since you opened it. Reload to see their changes.');
    }

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'unit',
      resourceId: String(unitId),
      communityId,
      oldValues,
      newValues,
    });

    const derivedOccupancy =
      occupancySourceFor(membership.communityType) === 'leases'
        ? (await apartmentOccupancyByUnit(communityId, [existing], membership.timezone, unitId)).get(unitId) ?? null
        : undefined;

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
      ...(derivedOccupancy !== undefined
        ? { occupancy: derivedOccupancy, occupancyConfirmed: true, occupancySource: 'leases' as const }
        : {
            occupancy: occupancy !== undefined ? (occupancy ?? null) : ((existing['occupancy'] as string | null) ?? null),
            occupancyConfirmed:
              occupancy !== undefined ? occupancy !== null : existing['occupancyConfirmedAt'] != null,
            occupancySource: 'manual' as const,
          }),
      updatedAt: updated['updatedAt'] as string,
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

    // Household members (no login) are on file too; deleting the unit would
    // leave them pointing at nothing.
    const householdMembers = await countOccupantsForUnit(communityId, unitId);
    if (householdMembers > 0) {
      throw new ValidationError(
        `Cannot delete unit ${unitId}: ${householdMembers} household member(s) are still on file. Move or remove them first.`,
      );
    }

    // Money and enforcement history must not disappear with the unit.
    const [balanceCents, openViolations] = await Promise.all([
      getUnitBalanceCents(scoped, unitId),
      countOpenViolationsForUnit(scoped, unitId),
    ]);
    if (balanceCents !== 0) {
      throw new ValidationError(
        `Cannot delete unit ${unitId}: its ledger balance is not zero. Settle or refund it first.`,
      );
    }
    if (openViolations > 0) {
      throw new ValidationError(
        `Cannot delete unit ${unitId}: ${openViolations} open violation(s). Resolve or dismiss them first.`,
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
