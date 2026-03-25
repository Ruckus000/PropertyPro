import { randomUUID } from 'node:crypto';
import {
  packageLog,
  visitorLog,
  deniedVisitors,
  createScopedClient,
  logAuditEvent,
  userRoles,
  type PackageLogStatus,
} from '@propertypro/db';
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, or } from '@propertypro/db/filters';
import { BadRequestError, NotFoundError } from '@/lib/api/errors';
import { queueNotification } from '@/lib/services/notification-service';

interface PackageLogRow {
  [key: string]: unknown;
  id: number;
  communityId: number;
  unitId: number;
  recipientName: string;
  carrier: string;
  trackingNumber: string | null;
  status: PackageLogStatus;
  receivedByStaffId: string | null;
  pickedUpAt: Date | null;
  pickedUpByName: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface VisitorLogRow {
  [key: string]: unknown;
  id: number;
  communityId: number;
  visitorName: string;
  purpose: string;
  hostUnitId: number;
  hostUserId: string | null;
  expectedArrival: Date;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  passCode: string;
  staffUserId: string | null;
  notes: string | null;
  guestType: string;
  validFrom: Date | null;
  validUntil: Date | null;
  recurrenceRule: string | null;
  expectedDurationMinutes: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  vehiclePlate: string | null;
  revokedByUserId: string | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface UnitResidentRow {
  [key: string]: unknown;
  userId: string;
  role: string;
}

export interface CreatePackageInput {
  unitId: number;
  recipientName: string;
  carrier: string;
  trackingNumber?: string | null;
  notes?: string | null;
}

export interface PickupPackageInput {
  pickedUpByName: string;
}

export interface CreateVisitorInput {
  visitorName: string;
  purpose: string;
  hostUnitId: number;
  expectedArrival?: string;
  notes?: string | null;
  guestType?: 'one_time' | 'recurring' | 'permanent' | 'vendor';
  validFrom?: string | null;
  validUntil?: string | null;
  recurrenceRule?: string | null;
  expectedDurationMinutes?: number | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleColor?: string | null;
  vehiclePlate?: string | null;
}

function parseTimestamp(value: string, label: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestError(`${label} must be a valid ISO timestamp`);
  }
  return parsed;
}

function buildPackageWhereClause(options: {
  unitId?: number;
  status?: PackageLogStatus;
  allowedUnitIds?: readonly number[];
}) {
  const clauses = [];

  if (options.unitId !== undefined) {
    clauses.push(eq(packageLog.unitId, options.unitId));
  }
  if (options.status !== undefined) {
    clauses.push(eq(packageLog.status, options.status));
  }
  if (options.allowedUnitIds && options.allowedUnitIds.length > 0) {
    clauses.push(inArray(packageLog.unitId, [...options.allowedUnitIds]));
  }

  if (clauses.length === 0) return undefined;
  if (clauses.length === 1) return clauses[0];
  return and(...clauses);
}

function buildVisitorWhereClause(options: {
  hostUnitId?: number;
  onlyActive?: boolean;
  allowedUnitIds?: readonly number[];
  hostUserId?: string;
  guestType?: string;
  status?: string;
}) {
  const clauses = [];

  if (options.hostUnitId !== undefined) {
    clauses.push(eq(visitorLog.hostUnitId, options.hostUnitId));
  }
  if (options.onlyActive) {
    clauses.push(isNull(visitorLog.checkedOutAt));
  }
  if (options.hostUserId) {
    clauses.push(eq(visitorLog.hostUserId, options.hostUserId));
  }
  if (options.allowedUnitIds && options.allowedUnitIds.length > 0) {
    clauses.push(inArray(visitorLog.hostUnitId, [...options.allowedUnitIds]));
  }
  if (options.guestType) {
    clauses.push(eq(visitorLog.guestType, options.guestType));
  }
  if (options.status) {
    const now = new Date();
    switch (options.status) {
      case 'expected':
        clauses.push(
          isNull(visitorLog.checkedInAt),
          isNull(visitorLog.revokedAt),
          or(isNull(visitorLog.validUntil), gte(visitorLog.validUntil, now)),
        );
        break;
      case 'checked_in':
        clauses.push(
          isNotNull(visitorLog.checkedInAt),
          isNull(visitorLog.checkedOutAt),
          isNull(visitorLog.revokedAt),
        );
        break;
      case 'checked_out':
        clauses.push(isNotNull(visitorLog.checkedOutAt));
        break;
      case 'expired':
        clauses.push(
          lt(visitorLog.validUntil, now),
          isNull(visitorLog.checkedInAt),
          isNull(visitorLog.revokedAt),
        );
        break;
      case 'revoked':
        clauses.push(
          isNotNull(visitorLog.revokedAt),
          isNotNull(visitorLog.checkedOutAt),
        );
        break;
      case 'revoked_on_site':
        clauses.push(
          isNotNull(visitorLog.revokedAt),
          isNull(visitorLog.checkedOutAt),
        );
        break;
    }
  }

  if (clauses.length === 0) return undefined;
  if (clauses.length === 1) return clauses[0];
  return and(...clauses);
}

async function resolveUnitResidents(
  communityId: number,
  unitId: number,
): Promise<string[]> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<UnitResidentRow>(
    userRoles,
    {
      userId: userRoles.userId,
      role: userRoles.role,
    },
    eq(userRoles.unitId, unitId),
  );

  return rows
    .filter((row) => row.role === 'resident')
    .map((row) => row.userId);
}

async function notifyResidentsOfPackage(
  communityId: number,
  packageEntry: PackageLogRow,
  actorUserId: string,
): Promise<number> {
  const residentUserIds = await resolveUnitResidents(communityId, packageEntry.unitId);
  let notifiedCount = 0;

  for (const recipientUserId of residentUserIds) {
    try {
      await queueNotification(
        communityId,
        {
          type: 'compliance_alert',
          alertTitle: 'New package received',
          alertDescription: `${packageEntry.carrier} delivery for ${packageEntry.recipientName}`,
          severity: 'info',
          sourceId: String(packageEntry.id),
        },
        {
          type: 'specific_user',
          userId: recipientUserId,
        },
        actorUserId,
      );
      notifiedCount += 1;
    } catch {
      // Notification delivery is best-effort and should not block package intake.
    }
  }

  return notifiedCount;
}

export async function createPackageForCommunity(
  communityId: number,
  actorUserId: string,
  input: CreatePackageInput,
  requestId?: string | null,
): Promise<PackageLogRow> {
  const scoped = createScopedClient(communityId);

  const [inserted] = await scoped.insert(packageLog, {
    unitId: input.unitId,
    recipientName: input.recipientName,
    carrier: input.carrier,
    trackingNumber: input.trackingNumber ?? null,
    status: 'received',
    receivedByStaffId: actorUserId,
    notes: input.notes ?? null,
  });

  if (!inserted) {
    throw new Error('Failed to create package log entry');
  }

  const created = inserted as unknown as PackageLogRow;
  const notifiedCount = await notifyResidentsOfPackage(communityId, created, actorUserId);

  let finalRow = created;
  if (notifiedCount > 0) {
    const [updated] = await scoped.update(
      packageLog,
      { status: 'notified' },
      eq(packageLog.id, created.id),
    );
    if (updated) {
      finalRow = updated as unknown as PackageLogRow;
    }
  }

  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'package_log',
    resourceId: String(finalRow.id),
    communityId,
    newValues: finalRow,
    metadata: {
      requestId: requestId ?? null,
      notifiedCount,
    },
  });

  return finalRow;
}

export async function listPackagesForCommunity(
  communityId: number,
  options: {
    unitId?: number;
    status?: PackageLogStatus;
    allowedUnitIds?: readonly number[];
  } = {},
): Promise<PackageLogRow[]> {
  const scoped = createScopedClient(communityId);

  const rows = await scoped
    .selectFrom<PackageLogRow>(
      packageLog,
      {},
      buildPackageWhereClause(options),
    )
    .orderBy(desc(packageLog.createdAt), desc(packageLog.id));

  return rows;
}

export async function pickupPackageForCommunity(
  communityId: number,
  packageId: number,
  actorUserId: string,
  input: PickupPackageInput,
  requestId?: string | null,
): Promise<PackageLogRow> {
  const scoped = createScopedClient(communityId);

  const rows = await scoped.selectFrom<PackageLogRow>(
    packageLog,
    {},
    eq(packageLog.id, packageId),
  );
  const existing = rows[0];
  if (!existing) {
    throw new NotFoundError('Package not found');
  }

  if (existing.status === 'picked_up') {
    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'package_log',
      resourceId: String(existing.id),
      communityId,
      metadata: {
        requestId: requestId ?? null,
        idempotent: true,
      },
    });

    return existing;
  }

  const [updated] = await scoped.update(
    packageLog,
    {
      status: 'picked_up',
      pickedUpAt: new Date(),
      pickedUpByName: input.pickedUpByName,
    },
    eq(packageLog.id, packageId),
  );

  if (!updated) {
    throw new NotFoundError('Package not found');
  }

  const row = updated as unknown as PackageLogRow;

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'package_log',
    resourceId: String(row.id),
    communityId,
    oldValues: existing,
    newValues: row,
    metadata: {
      requestId: requestId ?? null,
    },
  });

  return row;
}

export async function listMyPackagesForCommunity(
  communityId: number,
  allowedUnitIds: readonly number[],
): Promise<PackageLogRow[]> {
  const rows = await listPackagesForCommunity(communityId, {
    allowedUnitIds,
  });

  return rows.filter((row) => row.status !== 'picked_up');
}

export async function createVisitorForCommunity(
  communityId: number,
  actorUserId: string,
  input: CreateVisitorInput,
  requestId?: string | null,
): Promise<VisitorLogRow> {
  const scoped = createScopedClient(communityId);
  const passCode = `V-${randomUUID().slice(0, 8).toUpperCase()}`;

  const guestType = input.guestType ?? 'one_time';
  const validFrom = input.validFrom ? parseTimestamp(input.validFrom, 'validFrom') : null;
  const validUntil = input.validUntil ? parseTimestamp(input.validUntil, 'validUntil') : null;
  const expectedArrival = input.expectedArrival
    ? parseTimestamp(input.expectedArrival, 'expectedArrival')
    : validFrom;
  if (!expectedArrival) {
    throw new BadRequestError('expectedArrival or validFrom is required');
  }

  const [inserted] = await scoped.insert(visitorLog, {
    visitorName: input.visitorName,
    purpose: input.purpose,
    hostUnitId: input.hostUnitId,
    hostUserId: actorUserId,
    expectedArrival,
    passCode,
    notes: input.notes ?? null,
    guestType,
    validFrom,
    validUntil,
    recurrenceRule: input.recurrenceRule ?? null,
    expectedDurationMinutes: input.expectedDurationMinutes ?? null,
    vehicleMake: input.vehicleMake ?? null,
    vehicleModel: input.vehicleModel ?? null,
    vehicleColor: input.vehicleColor ?? null,
    vehiclePlate: input.vehiclePlate ?? null,
  });

  if (!inserted) {
    throw new Error('Failed to create visitor pass');
  }

  const created = inserted as unknown as VisitorLogRow;

  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'visitor_log',
    resourceId: String(created.id),
    communityId,
    newValues: created,
    metadata: {
      requestId: requestId ?? null,
    },
  });

  return created;
}

export async function listVisitorsForCommunity(
  communityId: number,
  options: {
    hostUnitId?: number;
    onlyActive?: boolean;
    allowedUnitIds?: readonly number[];
    hostUserId?: string;
    guestType?: string;
    status?: string;
  } = {},
): Promise<VisitorLogRow[]> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped
    .selectFrom<VisitorLogRow>(
      visitorLog,
      {},
      buildVisitorWhereClause(options),
    )
    .orderBy(desc(visitorLog.expectedArrival), desc(visitorLog.id));

  return rows;
}

export async function checkInVisitorForCommunity(
  communityId: number,
  visitorId: number,
  actorUserId: string,
  requestId?: string | null,
): Promise<VisitorLogRow> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<VisitorLogRow>(
    visitorLog,
    {},
    eq(visitorLog.id, visitorId),
  );
  const existing = rows[0];
  if (!existing) {
    throw new NotFoundError('Visitor pass not found');
  }

  if (existing.revokedAt) {
    throw new BadRequestError('This visitor pass has been revoked');
  }
  if (existing.validUntil && new Date(existing.validUntil) < new Date()) {
    throw new BadRequestError('This visitor pass has expired');
  }

  if (existing.checkedInAt) {
    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'visitor_log',
      resourceId: String(existing.id),
      communityId,
      metadata: {
        requestId: requestId ?? null,
        idempotent: true,
        transition: 'checkin',
      },
    });
    return existing;
  }

  const [updated] = await scoped.update(
    visitorLog,
    {
      checkedInAt: new Date(),
      staffUserId: actorUserId,
    },
    eq(visitorLog.id, visitorId),
  );

  if (!updated) {
    throw new NotFoundError('Visitor pass not found');
  }

  const row = updated as unknown as VisitorLogRow;

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'visitor_log',
    resourceId: String(row.id),
    communityId,
    oldValues: existing,
    newValues: row,
    metadata: {
      requestId: requestId ?? null,
      transition: 'checkin',
    },
  });

  return row;
}

export async function checkOutVisitorForCommunity(
  communityId: number,
  visitorId: number,
  actorUserId: string,
  requestId?: string | null,
): Promise<VisitorLogRow> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<VisitorLogRow>(
    visitorLog,
    {},
    eq(visitorLog.id, visitorId),
  );
  const existing = rows[0];
  if (!existing) {
    throw new NotFoundError('Visitor pass not found');
  }

  if (existing.checkedOutAt) {
    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'visitor_log',
      resourceId: String(existing.id),
      communityId,
      metadata: {
        requestId: requestId ?? null,
        idempotent: true,
        transition: 'checkout',
      },
    });
    return existing;
  }

  const [updated] = await scoped.update(
    visitorLog,
    {
      checkedOutAt: new Date(),
      staffUserId: actorUserId,
    },
    eq(visitorLog.id, visitorId),
  );

  if (!updated) {
    throw new NotFoundError('Visitor pass not found');
  }

  const row = updated as unknown as VisitorLogRow;

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'visitor_log',
    resourceId: String(row.id),
    communityId,
    oldValues: existing,
    newValues: row,
    metadata: {
      requestId: requestId ?? null,
      transition: 'checkout',
    },
  });

  return row;
}

export async function listMyVisitorsForCommunity(
  communityId: number,
  actorUserId: string,
  allowedUnitIds: readonly number[],
): Promise<VisitorLogRow[]> {
  const rows = await listVisitorsForCommunity(communityId, {
    allowedUnitIds,
    onlyActive: true,
  });

  return rows.filter((row) => row.hostUserId === actorUserId || allowedUnitIds.includes(row.hostUnitId));
}

export type VisitorStatus =
  | 'expected'
  | 'checked_in'
  | 'checked_out'
  | 'expired'
  | 'overstayed'
  | 'revoked'
  | 'revoked_on_site';

export function deriveVisitorStatus(visitor: VisitorLogRow): VisitorStatus {
  if (visitor.revokedAt && !visitor.checkedOutAt) return 'revoked_on_site';
  if (visitor.revokedAt) return 'revoked';
  if (visitor.checkedOutAt) return 'checked_out';
  if (visitor.checkedInAt && visitor.validUntil && visitor.validUntil < new Date()) return 'overstayed';
  if (visitor.checkedInAt) return 'checked_in';
  if (visitor.validUntil && visitor.validUntil < new Date()) return 'expired';
  return 'expected';
}

export async function revokeVisitorForCommunity(
  communityId: number,
  visitorId: number,
  actorUserId: string,
  reason: string | null,
  requestId: string | null,
): Promise<VisitorLogRow> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<VisitorLogRow>(
    visitorLog,
    {},
    and(eq(visitorLog.id, visitorId), isNull(visitorLog.deletedAt)),
  );
  const existing = rows[0];

  if (!existing) throw new NotFoundError('Visitor pass not found');

  if (existing.revokedAt) {
    await logAuditEvent({
      userId: actorUserId,
      communityId,
      action: 'update',
      resourceType: 'visitor_log',
      resourceId: String(visitorId),
      metadata: { requestId, idempotent: true, transition: 'revoke' },
    });
    return existing;
  }

  const [updated] = await scoped.update(
    visitorLog,
    { revokedAt: new Date(), revokedByUserId: actorUserId },
    eq(visitorLog.id, visitorId),
  );

  if (!updated) throw new NotFoundError('Visitor pass not found');

  const row = updated as unknown as VisitorLogRow;

  await logAuditEvent({
    userId: actorUserId,
    communityId,
    action: 'update',
    resourceType: 'visitor_log',
    resourceId: String(visitorId),
    oldValues: { revokedAt: null, revokedByUserId: null },
    newValues: { revokedAt: row.revokedAt, revokedByUserId: row.revokedByUserId },
    metadata: { requestId, transition: 'revoke', reason },
  });

  return row;
}

export async function revokeVisitorPassesForUser(
  communityId: number,
  userId: string,
): Promise<number> {
  const scoped = createScopedClient(communityId);
  const result = await scoped.update(
    visitorLog,
    { revokedAt: new Date() },
    and(
      eq(visitorLog.hostUserId, userId),
      isNull(visitorLog.revokedAt),
      isNull(visitorLog.checkedOutAt),
      isNull(visitorLog.deletedAt),
      inArray(visitorLog.guestType, ['recurring', 'permanent']),
    ),
  );
  return result.length;
}

// ---------------------------------------------------------------------------
// Denied Visitors
// ---------------------------------------------------------------------------

export interface DeniedVisitorRow {
  [key: string]: unknown;
  id: number;
  communityId: number;
  fullName: string;
  reason: string;
  deniedByUserId: string | null;
  vehiclePlate: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeniedMatchResult {
  [key: string]: unknown;
  id: number;
  fullName: string;
  vehiclePlate: string | null;
  reason: string;
  isActive: boolean;
}

export interface CreateDeniedVisitorInput {
  fullName: string;
  reason: string;
  vehiclePlate?: string | null;
  notes?: string | null;
}

export interface UpdateDeniedVisitorInput {
  fullName?: string;
  reason?: string;
  vehiclePlate?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export async function createDeniedVisitor(
  communityId: number,
  actorUserId: string,
  input: CreateDeniedVisitorInput,
  requestId: string | null,
): Promise<DeniedVisitorRow> {
  const scoped = createScopedClient(communityId);
  const [created] = await scoped.insert(deniedVisitors, {
    communityId,
    fullName: input.fullName,
    reason: input.reason,
    deniedByUserId: actorUserId,
    vehiclePlate: input.vehiclePlate ?? null,
    notes: input.notes ?? null,
  });

  if (!created) {
    throw new Error('Failed to create denied visitor entry');
  }

  const row = created as unknown as DeniedVisitorRow;

  await logAuditEvent({
    userId: actorUserId,
    communityId,
    action: 'create',
    resourceType: 'denied_visitors',
    resourceId: String(row.id),
    newValues: row,
    metadata: { requestId },
  });

  return row;
}

export async function listDeniedVisitors(
  communityId: number,
  onlyActive?: boolean,
): Promise<DeniedVisitorRow[]> {
  const scoped = createScopedClient(communityId);
  const additionalWhere =
    onlyActive !== undefined ? eq(deniedVisitors.isActive, onlyActive) : undefined;
  const rows = await scoped
    .selectFrom<DeniedVisitorRow>(deniedVisitors, {}, additionalWhere)
    .orderBy(desc(deniedVisitors.createdAt));

  return rows;
}

export async function updateDeniedVisitor(
  communityId: number,
  deniedId: number,
  actorUserId: string,
  input: UpdateDeniedVisitorInput,
  requestId: string | null,
): Promise<DeniedVisitorRow> {
  const scoped = createScopedClient(communityId);
  const existing = await scoped.selectFrom<DeniedVisitorRow>(
    deniedVisitors,
    {},
    eq(deniedVisitors.id, deniedId),
  );

  if (!existing[0]) throw new NotFoundError('Denied visitor entry not found');

  const [updated] = await scoped.update(
    deniedVisitors,
    { ...input, updatedAt: new Date() },
    eq(deniedVisitors.id, deniedId),
  );

  if (!updated) throw new NotFoundError('Denied visitor entry not found');

  const row = updated as unknown as DeniedVisitorRow;

  await logAuditEvent({
    userId: actorUserId,
    communityId,
    action: 'update',
    resourceType: 'denied_visitors',
    resourceId: String(deniedId),
    oldValues: existing[0],
    newValues: row,
    metadata: { requestId },
  });

  return row;
}

export async function softDeleteDeniedVisitor(
  communityId: number,
  deniedId: number,
  actorUserId: string,
  requestId: string | null,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  const existing = await scoped.selectFrom<DeniedVisitorRow>(
    deniedVisitors,
    {},
    eq(deniedVisitors.id, deniedId),
  );

  if (!existing[0]) throw new NotFoundError('Denied visitor entry not found');

  await scoped.update(
    deniedVisitors,
    { deletedAt: new Date(), updatedAt: new Date() },
    eq(deniedVisitors.id, deniedId),
  );

  await logAuditEvent({
    userId: actorUserId,
    communityId,
    action: 'delete',
    resourceType: 'denied_visitors',
    resourceId: String(deniedId),
    oldValues: existing[0],
    metadata: { requestId },
  });
}

export async function matchDeniedVisitors(
  communityId: number,
  name: string | null,
  plate: string | null,
): Promise<DeniedMatchResult[]> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<DeniedMatchResult>(
    deniedVisitors,
    {
      id: deniedVisitors.id,
      fullName: deniedVisitors.fullName,
      vehiclePlate: deniedVisitors.vehiclePlate,
      reason: deniedVisitors.reason,
      isActive: deniedVisitors.isActive,
    },
    eq(deniedVisitors.isActive, true),
  );

  const nameNorm = name?.toLowerCase().trim() ?? null;
  const plateNorm = plate?.toUpperCase().trim() ?? null;

  return rows.filter((row) => {
    if (nameNorm && row.fullName.toLowerCase().trim() === nameNorm) return true;
    if (plateNorm && row.vehiclePlate?.toUpperCase().trim() === plateNorm) return true;
    return false;
  });
}
