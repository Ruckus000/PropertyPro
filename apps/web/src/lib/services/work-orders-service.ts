import {
  amenities,
  amenityReservations,
  createScopedClient,
  logAuditEvent,
  vendors,
  workOrders,
  type AmenityBookingRules,
  type AmenityReservationStatus,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from '@propertypro/db';
import { and, asc, desc, eq, inArray } from '@propertypro/db/filters';
import { AppError } from '@/lib/api/errors/AppError';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from '@/lib/api/errors';

interface VendorRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  specialties: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkOrderRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  title: string;
  description: string | null;
  unitId: number | null;
  vendorId: number | null;
  assignedByUserId: string | null;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  slaResponseHours: number | null;
  slaCompletionHours: number | null;
  assignedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  closedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AmenityRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  name: string;
  description: string | null;
  location: string | null;
  capacity: number | null;
  isBookable: boolean;
  bookingRules: AmenityBookingRules;
  createdAt: Date;
  updatedAt: Date;
}

interface AmenityReservationRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  amenityId: number;
  userId: string;
  unitId: number | null;
  startTime: Date;
  endTime: Date;
  status: AmenityReservationStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVendorInput {
  name: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  specialties?: string[];
  isActive?: boolean;
}

export interface UpdateVendorInput {
  name?: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  specialties?: string[];
  isActive?: boolean;
}

export interface CreateWorkOrderInput {
  title: string;
  description?: string | null;
  unitId?: number | null;
  vendorId?: number | null;
  priority?: WorkOrderPriority;
  status?: WorkOrderStatus;
  slaResponseHours?: number | null;
  slaCompletionHours?: number | null;
  notes?: string | null;
}

export interface UpdateWorkOrderInput {
  title?: string;
  description?: string | null;
  unitId?: number | null;
  vendorId?: number | null;
  priority?: WorkOrderPriority;
  status?: WorkOrderStatus;
  slaResponseHours?: number | null;
  slaCompletionHours?: number | null;
  notes?: string | null;
}

export interface CreateAmenityInput {
  name: string;
  description?: string | null;
  location?: string | null;
  capacity?: number | null;
  isBookable?: boolean;
  bookingRules?: AmenityBookingRules;
}

export interface UpdateAmenityInput {
  name?: string;
  description?: string | null;
  location?: string | null;
  capacity?: number | null;
  isBookable?: boolean;
  bookingRules?: AmenityBookingRules;
}

export interface CreateReservationInput {
  amenityId: number;
  unitId?: number | null;
  startTime: string;
  endTime: string;
  notes?: string | null;
}

const VALID_WORK_ORDER_PRIORITIES: readonly WorkOrderPriority[] = ['low', 'medium', 'high', 'urgent'];
const VALID_WORK_ORDER_STATUSES: readonly WorkOrderStatus[] = ['created', 'assigned', 'in_progress', 'completed', 'closed'];
const VALID_RESERVATION_STATUSES: readonly AmenityReservationStatus[] = ['confirmed', 'cancelled'];

function hasPostgresErrorCode(error: unknown, expectedCode: string): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  if ('code' in error && (error as { code: unknown }).code === expectedCode) {
    return true;
  }

  if ('cause' in error) {
    return hasPostgresErrorCode((error as { cause: unknown }).cause, expectedCode);
  }

  return false;
}

function isUniqueConstraintError(error: unknown): boolean {
  return hasPostgresErrorCode(error, '23505');
}

function isExclusionConstraintError(error: unknown): boolean {
  return hasPostgresErrorCode(error, '23P01');
}

function assertWorkOrderPriority(value: string): WorkOrderPriority {
  if (!VALID_WORK_ORDER_PRIORITIES.includes(value as WorkOrderPriority)) {
    throw new UnprocessableEntityError(`Invalid work order priority: ${value}`);
  }
  return value as WorkOrderPriority;
}

function assertWorkOrderStatus(value: string): WorkOrderStatus {
  if (!VALID_WORK_ORDER_STATUSES.includes(value as WorkOrderStatus)) {
    throw new UnprocessableEntityError(`Invalid work order status: ${value}`);
  }
  return value as WorkOrderStatus;
}

function assertReservationStatus(value: string): AmenityReservationStatus {
  if (!VALID_RESERVATION_STATUSES.includes(value as AmenityReservationStatus)) {
    throw new UnprocessableEntityError(`Invalid reservation status: ${value}`);
  }
  return value as AmenityReservationStatus;
}

function normalizeSpecialties(values: string[] | undefined): string[] {
  if (!values) return [];
  const normalized = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(normalized)];
}

function parseTimestamp(value: string, label: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestError(`${label} must be a valid ISO timestamp`);
  }
  return parsed;
}

function mapVendorRow(row: VendorRecord): VendorRecord {
  return {
    ...row,
    specialties: Array.isArray(row.specialties) ? row.specialties.map((value) => String(value)) : [],
  };
}

function mapWorkOrderRow(row: WorkOrderRecord): WorkOrderRecord {
  return {
    ...row,
    priority: assertWorkOrderPriority(row.priority),
    status: assertWorkOrderStatus(row.status),
  };
}

function mapAmenityRow(row: AmenityRecord): AmenityRecord {
  return {
    ...row,
    bookingRules: row.bookingRules ?? {},
  };
}

function mapReservationRow(row: AmenityReservationRecord): AmenityReservationRecord {
  return {
    ...row,
    status: assertReservationStatus(row.status),
  };
}

function reservationsOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  return startA < endB && startB < endA;
}

function deriveSlaState(row: WorkOrderRecord): {
  responseSlaBreached: boolean;
  completionSlaBreached: boolean;
} {
  const now = Date.now();

  const responseDeadline = row.slaResponseHours
    ? row.createdAt.getTime() + row.slaResponseHours * 60 * 60 * 1000
    : null;
  const completionDeadline = row.slaCompletionHours
    ? row.createdAt.getTime() + row.slaCompletionHours * 60 * 60 * 1000
    : null;

  const responseSlaBreached = responseDeadline !== null
    && row.assignedAt === null
    && now > responseDeadline;

  const completionSlaBreached = completionDeadline !== null
    && row.completedAt === null
    && row.closedAt === null
    && now > completionDeadline;

  return {
    responseSlaBreached,
    completionSlaBreached,
  };
}

async function ensureVendorActive(
  communityId: number,
  vendorId: number,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<VendorRecord>(vendors, {}, eq(vendors.id, vendorId));
  const vendor = rows[0];

  if (!vendor) {
    throw new UnprocessableEntityError('Vendor not found in this community');
  }

  if (!vendor.isActive) {
    throw new UnprocessableEntityError('Cannot assign inactive vendor');
  }
}

export async function listVendorsForCommunity(
  communityId: number,
): Promise<VendorRecord[]> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped
    .selectFrom<VendorRecord>(vendors, {})
    .orderBy(desc(vendors.isActive), asc(vendors.name));

  return rows.map(mapVendorRow);
}

export async function createVendorForCommunity(
  communityId: number,
  actorUserId: string,
  input: CreateVendorInput,
  requestId?: string | null,
): Promise<VendorRecord> {
  const scoped = createScopedClient(communityId);
  const [inserted] = await scoped.insert(vendors, {
    name: input.name.trim(),
    company: input.company ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    specialties: normalizeSpecialties(input.specialties),
    isActive: input.isActive ?? true,
  });

  if (!inserted) {
    throw new Error('Failed to create vendor');
  }

  const created = mapVendorRow(inserted as unknown as VendorRecord);
  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'vendor',
    resourceId: String(created.id),
    communityId,
    newValues: created,
    metadata: { requestId: requestId ?? null },
  });

  return created;
}

export async function updateVendorForCommunity(
  communityId: number,
  vendorId: number,
  actorUserId: string,
  input: UpdateVendorInput,
  requestId?: string | null,
): Promise<VendorRecord> {
  const scoped = createScopedClient(communityId);
  const existingRows = await scoped.selectFrom<VendorRecord>(vendors, {}, eq(vendors.id, vendorId));
  const existing = existingRows[0];

  if (!existing) {
    throw new NotFoundError('Vendor not found');
  }

  const [updated] = await scoped.update(
    vendors,
    {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.company !== undefined ? { company: input.company } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.specialties !== undefined ? { specialties: normalizeSpecialties(input.specialties) } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    eq(vendors.id, vendorId),
  );

  if (!updated) {
    throw new NotFoundError('Vendor not found');
  }

  const row = mapVendorRow(updated as unknown as VendorRecord);
  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'vendor',
    resourceId: String(vendorId),
    communityId,
    oldValues: existing,
    newValues: row,
    metadata: { requestId: requestId ?? null },
  });

  return row;
}

export async function listWorkOrdersForCommunity(
  communityId: number,
  filters?: {
    status?: WorkOrderStatus;
    unitId?: number;
    allowedUnitIds?: number[];
  },
): Promise<Array<WorkOrderRecord & { responseSlaBreached: boolean; completionSlaBreached: boolean }>> {
  const scoped = createScopedClient(communityId);
  const whereFilters = [];

  if (filters?.status) {
    whereFilters.push(eq(workOrders.status, filters.status));
  }
  if (filters?.unitId !== undefined) {
    whereFilters.push(eq(workOrders.unitId, filters.unitId));
  }
  if (filters?.allowedUnitIds) {
    if (filters.allowedUnitIds.length === 0) {
      return [];
    }
    whereFilters.push(inArray(workOrders.unitId, filters.allowedUnitIds));
  }

  const rows = whereFilters.length > 0
    ? await scoped
      .selectFrom<WorkOrderRecord>(workOrders, {}, and(...whereFilters))
      .orderBy(desc(workOrders.createdAt))
    : await scoped
      .selectFrom<WorkOrderRecord>(workOrders, {})
      .orderBy(desc(workOrders.createdAt));

  return rows.map((row) => {
    const mapped = mapWorkOrderRow(row);
    return {
      ...mapped,
      ...deriveSlaState(mapped),
    };
  });
}

export async function getWorkOrderForCommunity(
  communityId: number,
  workOrderId: number,
): Promise<WorkOrderRecord & { responseSlaBreached: boolean; completionSlaBreached: boolean }> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<WorkOrderRecord>(workOrders, {}, eq(workOrders.id, workOrderId));
  const row = rows[0];

  if (!row) {
    throw new NotFoundError('Work order not found');
  }

  const mapped = mapWorkOrderRow(row);
  return {
    ...mapped,
    ...deriveSlaState(mapped),
  };
}

export async function createWorkOrderForCommunity(
  communityId: number,
  actorUserId: string,
  input: CreateWorkOrderInput,
  requestId?: string | null,
): Promise<WorkOrderRecord> {
  if (input.vendorId !== undefined && input.vendorId !== null) {
    await ensureVendorActive(communityId, input.vendorId);
  }

  const scoped = createScopedClient(communityId);
  const status = input.status ? assertWorkOrderStatus(input.status) : 'created';
  const now = new Date();

  const [inserted] = await scoped.insert(workOrders, {
    title: input.title.trim(),
    description: input.description ?? null,
    unitId: input.unitId ?? null,
    vendorId: input.vendorId ?? null,
    assignedByUserId: input.vendorId ? actorUserId : null,
    priority: input.priority ? assertWorkOrderPriority(input.priority) : 'medium',
    status,
    slaResponseHours: input.slaResponseHours ?? null,
    slaCompletionHours: input.slaCompletionHours ?? null,
    assignedAt: status === 'assigned' || status === 'in_progress' || status === 'completed' || status === 'closed'
      ? now
      : null,
    startedAt: status === 'in_progress' || status === 'completed' || status === 'closed' ? now : null,
    completedAt: status === 'completed' || status === 'closed' ? now : null,
    closedAt: status === 'closed' ? now : null,
    notes: input.notes ?? null,
  });

  if (!inserted) {
    throw new Error('Failed to create work order');
  }

  const created = mapWorkOrderRow(inserted as unknown as WorkOrderRecord);
  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'work_order',
    resourceId: String(created.id),
    communityId,
    newValues: created,
    metadata: { requestId: requestId ?? null },
  });

  return created;
}

export async function updateWorkOrderForCommunity(
  communityId: number,
  workOrderId: number,
  actorUserId: string,
  input: UpdateWorkOrderInput,
  requestId?: string | null,
): Promise<WorkOrderRecord> {
  const scoped = createScopedClient(communityId);
  const existingRows = await scoped.selectFrom<WorkOrderRecord>(workOrders, {}, eq(workOrders.id, workOrderId));
  const existing = existingRows[0];

  if (!existing) {
    throw new NotFoundError('Work order not found');
  }

  if (input.vendorId !== undefined && input.vendorId !== null) {
    await ensureVendorActive(communityId, input.vendorId);
  }

  const status = input.status ? assertWorkOrderStatus(input.status) : existing.status;
  const now = new Date();

  const [updated] = await scoped.update(
    workOrders,
    {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.unitId !== undefined ? { unitId: input.unitId } : {}),
      ...(input.vendorId !== undefined ? { vendorId: input.vendorId } : {}),
      ...(input.vendorId !== undefined ? { assignedByUserId: input.vendorId ? actorUserId : null } : {}),
      ...(input.priority !== undefined ? { priority: assertWorkOrderPriority(input.priority) } : {}),
      ...(input.status !== undefined ? { status } : {}),
      ...(input.slaResponseHours !== undefined ? { slaResponseHours: input.slaResponseHours } : {}),
      ...(input.slaCompletionHours !== undefined ? { slaCompletionHours: input.slaCompletionHours } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.status !== undefined && (
        status === 'assigned' || status === 'in_progress' || status === 'completed' || status === 'closed'
      ) && existing.assignedAt === null ? { assignedAt: now } : {}),
      ...(input.status !== undefined && (
        status === 'in_progress' || status === 'completed' || status === 'closed'
      ) && existing.startedAt === null ? { startedAt: now } : {}),
      ...(input.status !== undefined && (
        status === 'completed' || status === 'closed'
      ) && existing.completedAt === null ? { completedAt: now } : {}),
      ...(input.status !== undefined && status === 'closed' && existing.closedAt === null ? { closedAt: now } : {}),
    },
    eq(workOrders.id, workOrderId),
  );

  if (!updated) {
    throw new NotFoundError('Work order not found');
  }

  const row = mapWorkOrderRow(updated as unknown as WorkOrderRecord);
  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'work_order',
    resourceId: String(workOrderId),
    communityId,
    oldValues: existing,
    newValues: row,
    metadata: { requestId: requestId ?? null },
  });

  return row;
}

export async function completeWorkOrderForCommunity(
  communityId: number,
  workOrderId: number,
  actorUserId: string,
  requestId?: string | null,
): Promise<WorkOrderRecord> {
  return updateWorkOrderForCommunity(
    communityId,
    workOrderId,
    actorUserId,
    { status: 'completed' },
    requestId,
  );
}

export async function listAmenitiesForCommunity(
  communityId: number,
): Promise<AmenityRecord[]> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped
    .selectFrom<AmenityRecord>(amenities, {})
    .orderBy(asc(amenities.name));

  return rows.map(mapAmenityRow);
}

export async function createAmenityForCommunity(
  communityId: number,
  actorUserId: string,
  input: CreateAmenityInput,
  requestId?: string | null,
): Promise<AmenityRecord> {
  const scoped = createScopedClient(communityId);
  const [inserted] = await scoped.insert(amenities, {
    name: input.name.trim(),
    description: input.description ?? null,
    location: input.location ?? null,
    capacity: input.capacity ?? null,
    isBookable: input.isBookable ?? true,
    bookingRules: input.bookingRules ?? {},
  });

  if (!inserted) {
    throw new Error('Failed to create amenity');
  }

  const created = mapAmenityRow(inserted as unknown as AmenityRecord);
  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'amenity',
    resourceId: String(created.id),
    communityId,
    newValues: created,
    metadata: { requestId: requestId ?? null },
  });

  return created;
}

export async function updateAmenityForCommunity(
  communityId: number,
  amenityId: number,
  actorUserId: string,
  input: UpdateAmenityInput,
  requestId?: string | null,
): Promise<AmenityRecord> {
  const scoped = createScopedClient(communityId);
  const existingRows = await scoped.selectFrom<AmenityRecord>(amenities, {}, eq(amenities.id, amenityId));
  const existing = existingRows[0];

  if (!existing) {
    throw new NotFoundError('Amenity not found');
  }

  const [updated] = await scoped.update(
    amenities,
    {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.isBookable !== undefined ? { isBookable: input.isBookable } : {}),
      ...(input.bookingRules !== undefined ? { bookingRules: input.bookingRules } : {}),
    },
    eq(amenities.id, amenityId),
  );

  if (!updated) {
    throw new NotFoundError('Amenity not found');
  }

  const row = mapAmenityRow(updated as unknown as AmenityRecord);
  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'amenity',
    resourceId: String(amenityId),
    communityId,
    oldValues: existing,
    newValues: row,
    metadata: { requestId: requestId ?? null },
  });

  return row;
}

export async function createReservationForCommunity(
  communityId: number,
  actorUserId: string,
  input: CreateReservationInput,
  requestId?: string | null,
): Promise<AmenityReservationRecord> {
  const scoped = createScopedClient(communityId);
  const amenityRows = await scoped.selectFrom<AmenityRecord>(amenities, {}, eq(amenities.id, input.amenityId));
  const amenity = amenityRows[0];

  if (!amenity) {
    throw new NotFoundError('Amenity not found');
  }

  if (!amenity.isBookable) {
    throw new UnprocessableEntityError('Amenity is not bookable');
  }

  const startTime = parseTimestamp(input.startTime, 'startTime');
  const endTime = parseTimestamp(input.endTime, 'endTime');
  if (endTime <= startTime) {
    throw new UnprocessableEntityError('endTime must be after startTime');
  }
  if (startTime.getTime() < Date.now()) {
    throw new UnprocessableEntityError('Reservations cannot start in the past');
  }

  const existingReservations = await scoped.selectFrom<AmenityReservationRecord>(
    amenityReservations,
    {},
    and(
      eq(amenityReservations.amenityId, input.amenityId),
      eq(amenityReservations.status, 'confirmed'),
    ),
  );

  const hasOverlap = existingReservations.some((reservation) =>
    reservationsOverlap(startTime, endTime, reservation.startTime, reservation.endTime));
  if (hasOverlap) {
    throw new AppError('Reservation conflicts with an existing booking', 409, 'CONFLICT');
  }

  try {
    const [inserted] = await scoped.insert(amenityReservations, {
      amenityId: input.amenityId,
      userId: actorUserId,
      unitId: input.unitId ?? null,
      startTime,
      endTime,
      status: 'confirmed',
      notes: input.notes ?? null,
    });

    if (!inserted) {
      throw new Error('Failed to create reservation');
    }

    const created = mapReservationRow(inserted as unknown as AmenityReservationRecord);
    await logAuditEvent({
      userId: actorUserId,
      action: 'create',
      resourceType: 'amenity_reservation',
      resourceId: String(created.id),
      communityId,
      newValues: created,
      metadata: { requestId: requestId ?? null },
    });

    return created;
  } catch (error) {
    if (isExclusionConstraintError(error) || isUniqueConstraintError(error)) {
      throw new AppError('Reservation conflicts with an existing booking', 409, 'CONFLICT');
    }
    throw error;
  }
}

export async function getAmenityScheduleForCommunity(
  communityId: number,
  amenityId: number,
): Promise<AmenityReservationRecord[]> {
  const scoped = createScopedClient(communityId);
  const amenityRows = await scoped.selectFrom<AmenityRecord>(amenities, {}, eq(amenities.id, amenityId));
  if (amenityRows.length === 0) {
    throw new NotFoundError('Amenity not found');
  }

  const rows = await scoped
    .selectFrom<AmenityReservationRecord>(amenityReservations, {}, eq(amenityReservations.amenityId, amenityId))
    .orderBy(asc(amenityReservations.startTime));

  return rows.map(mapReservationRow);
}

export async function cancelReservationForCommunity(
  communityId: number,
  reservationId: number,
  actorUserId: string,
  canCancelAny: boolean,
  requestId?: string | null,
): Promise<AmenityReservationRecord> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<AmenityReservationRecord>(
    amenityReservations,
    {},
    eq(amenityReservations.id, reservationId),
  );
  const existing = rows[0];

  if (!existing) {
    throw new NotFoundError('Reservation not found');
  }

  if (!canCancelAny && existing.userId !== actorUserId) {
    throw new ForbiddenError('You can only cancel your own reservations');
  }

  if (existing.status === 'cancelled') {
    return mapReservationRow(existing);
  }

  const [updated] = await scoped.update(
    amenityReservations,
    {
      status: 'cancelled',
    },
    eq(amenityReservations.id, reservationId),
  );

  if (!updated) {
    throw new NotFoundError('Reservation not found');
  }

  const row = mapReservationRow(updated as unknown as AmenityReservationRecord);
  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'amenity_reservation',
    resourceId: String(reservationId),
    communityId,
    oldValues: existing,
    newValues: row,
    metadata: { requestId: requestId ?? null },
  });

  return row;
}

export async function listReservationsForActor(
  communityId: number,
  actorUserId: string,
): Promise<AmenityReservationRecord[]> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped
    .selectFrom<AmenityReservationRecord>(
      amenityReservations,
      {},
      eq(amenityReservations.userId, actorUserId),
    )
    .orderBy(desc(amenityReservations.startTime));

  return rows.map(mapReservationRow);
}
