import {
  amenities,
  amenityReservations,
  createScopedClient,
  maintenanceRequests,
  workOrders,
} from '@propertypro/db';
import { and, desc, eq, lt, lte, or } from '@propertypro/db/filters';
import { ValidationError } from '@/lib/api/errors';

export type OperationsSourceType = 'maintenance_request' | 'work_order' | 'reservation';

export interface OperationsListItem {
  id: number;
  type: OperationsSourceType;
  title: string;
  status: string;
  priority: string;
  unitId: number | null;
  createdAt: string;
}

export interface OperationsListResponse {
  data: OperationsListItem[];
  meta: {
    cursor: string | null;
    limit: number;
    partialFailure: boolean;
    unavailableSources: OperationsSourceType[];
  };
}

export interface OperationsListParams {
  cursor?: string | null;
  limit?: number;
  type?: OperationsSourceType;
  status?: string | null;
  priority?: string | null;
  unitId?: number | null;
}

interface OperationsCursorPayload {
  createdAt: string;
  id: number;
  type: OperationsSourceType;
}

interface OperationSummaryRecord {
  [key: string]: unknown;
  id: number;
  title: string;
  status: string;
  priority: string;
  unitId: number | null;
  createdAt: Date;
}

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 25;
const SOURCE_TIMEOUT_MS = 3_000;
const SOURCE_ORDER: Record<OperationsSourceType, number> = {
  maintenance_request: 0,
  work_order: 1,
  reservation: 2,
};

function encodeCursor(payload: OperationsCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): OperationsCursorPayload {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<OperationsCursorPayload>;
    if (
      typeof decoded.createdAt !== 'string' ||
      typeof decoded.id !== 'number' ||
      (decoded.type !== 'maintenance_request'
        && decoded.type !== 'work_order'
        && decoded.type !== 'reservation')
    ) {
      throw new Error('Invalid cursor');
    }
    return {
      createdAt: decoded.createdAt,
      id: decoded.id,
      type: decoded.type,
    };
  } catch {
    throw new ValidationError('Invalid operations cursor');
  }
}

function mapSummaryRow(type: OperationsSourceType, row: OperationSummaryRecord): OperationsListItem {
  return {
    id: row.id,
    type,
    title: row.title,
    status: row.status,
    priority: row.priority,
    unitId: row.unitId,
    createdAt: row.createdAt.toISOString(),
  };
}

async function attachReservationTitles(
  communityId: number,
  rows: OperationSummaryRecord[],
): Promise<OperationSummaryRecord[]> {
  const amenityIds = Array.from(
    new Set(
      rows
        .map((row) => (row as unknown as { amenityId?: number }).amenityId)
        .filter((id): id is number => typeof id === 'number'),
    ),
  );
  if (amenityIds.length === 0) return rows;

  const scoped = createScopedClient(communityId);
  const amenityRows = await scoped
    .selectFrom<{ id: number; name: string }>(
      amenities,
      { id: amenities.id, name: amenities.name },
    )
    .orderBy(desc(amenities.id));

  const nameById = new Map<number, string>();
  for (const amenity of amenityRows) {
    if (amenityIds.includes(amenity.id)) nameById.set(amenity.id, amenity.name);
  }

  return rows.map((row) => {
    const amenityId = (row as unknown as { amenityId?: number }).amenityId;
    const amenityName = typeof amenityId === 'number' ? nameById.get(amenityId) : undefined;
    return {
      ...row,
      title: amenityName ? `Reservation — ${amenityName}` : 'Reservation',
      priority: 'normal',
    };
  });
}

function buildCursorFilter(
  type: OperationsSourceType,
  cursor: OperationsCursorPayload,
  createdAtColumn: { _?: unknown } | unknown,
  idColumn: { _?: unknown } | unknown,
) {
  const sourceOrder = SOURCE_ORDER[type];
  const cursorOrder = SOURCE_ORDER[cursor.type];
  const cursorCreatedAt = new Date(cursor.createdAt);

  if (sourceOrder < cursorOrder) {
    return lt(createdAtColumn as never, cursorCreatedAt);
  }

  if (sourceOrder > cursorOrder) {
    return lte(createdAtColumn as never, cursorCreatedAt);
  }

  return or(
    lt(createdAtColumn as never, cursorCreatedAt),
    and(
      eq(createdAtColumn as never, cursorCreatedAt),
      lt(idColumn as never, cursor.id),
    ),
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function fetchSourceRows(
  communityId: number,
  sourceType: OperationsSourceType,
  params: OperationsListParams,
): Promise<OperationSummaryRecord[]> {
  const scoped = createScopedClient(communityId);
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT) + 1;
  const cursor = params.cursor ? decodeCursor(params.cursor) : null;
  const filters: unknown[] = [];

  if (sourceType === 'reservation') {
    if (params.unitId != null) {
      filters.push(eq(amenityReservations.unitId, params.unitId));
    }
    if (params.status) {
      filters.push(eq(amenityReservations.status, params.status as never));
    }
    // Ignore params.priority — reservations have no priority column.
    if (cursor) {
      filters.push(
        buildCursorFilter(
          sourceType,
          cursor,
          amenityReservations.createdAt,
          amenityReservations.id,
        ),
      );
    }
    const where = filters.length > 0 ? and(...(filters as [never, ...never[]])) : undefined;
    const rows = await scoped
      .selectFrom<OperationSummaryRecord>(
        amenityReservations,
        {
          id: amenityReservations.id,
          // Placeholder columns — overwritten by attachReservationTitles below.
          title: amenityReservations.id,
          status: amenityReservations.status,
          priority: amenityReservations.id,
          unitId: amenityReservations.unitId,
          createdAt: amenityReservations.createdAt,
          amenityId: amenityReservations.amenityId,
        },
        where as never,
      )
      .orderBy(desc(amenityReservations.createdAt), desc(amenityReservations.id))
      .limit(limit);
    return rows as OperationSummaryRecord[];
  }

  if (params.status) {
    filters.push(
      sourceType === 'maintenance_request'
        ? eq(maintenanceRequests.status, params.status as never)
        : eq(workOrders.status, params.status as never),
    );
  }

  if (params.priority) {
    filters.push(
      sourceType === 'maintenance_request'
        ? eq(maintenanceRequests.priority, params.priority as never)
        : eq(workOrders.priority, params.priority as never),
    );
  }

  if (params.unitId != null) {
    filters.push(
      sourceType === 'maintenance_request'
        ? eq(maintenanceRequests.unitId, params.unitId)
        : eq(workOrders.unitId, params.unitId),
    );
  }

  if (cursor) {
    filters.push(
      buildCursorFilter(
        sourceType,
        cursor,
        sourceType === 'maintenance_request' ? maintenanceRequests.createdAt : workOrders.createdAt,
        sourceType === 'maintenance_request' ? maintenanceRequests.id : workOrders.id,
      ),
    );
  }

  const where = filters.length > 0
    ? and(...(filters as [never, ...never[]]))
    : undefined;

  const table = sourceType === 'maintenance_request' ? maintenanceRequests : workOrders;
  const rows = await scoped
    .selectFrom<OperationSummaryRecord>(
      table,
      {
        id: table.id,
        title: table.title,
        status: table.status,
        priority: table.priority,
        unitId: table.unitId,
        createdAt: table.createdAt,
      },
      where as never,
    )
    .orderBy(desc(table.createdAt), desc(table.id))
    .limit(limit);

  return rows as OperationSummaryRecord[];
}

export async function listOperationsForCommunity(
  communityId: number,
  params: OperationsListParams = {},
): Promise<OperationsListResponse> {
  const sources: OperationsSourceType[] = params.type ? [params.type] : ['maintenance_request', 'work_order', 'reservation'];
  const settled = await Promise.allSettled(
    sources.map((sourceType) =>
      withTimeout(
        fetchSourceRows(communityId, sourceType, params),
        SOURCE_TIMEOUT_MS,
        sourceType,
      ),
    ),
  );

  const unavailableSources: OperationsSourceType[] = [];
  const rawItemsByType = new Map<OperationsSourceType, OperationSummaryRecord[]>();

  settled.forEach((result, index) => {
    const sourceType = sources[index]!;
    if (result.status === 'rejected') {
      unavailableSources.push(sourceType);
      return;
    }
    rawItemsByType.set(sourceType, result.value);
  });

  const reservationRows = rawItemsByType.get('reservation');
  if (reservationRows && reservationRows.length > 0) {
    rawItemsByType.set('reservation', await attachReservationTitles(communityId, reservationRows));
  }

  const items: OperationsListItem[] = [];
  for (const [sourceType, rows] of rawItemsByType.entries()) {
    for (const row of rows.slice(0, (params.limit ?? DEFAULT_LIMIT) + 1)) {
      items.push(mapSummaryRow(sourceType, row));
    }
  }

  items.sort((a, b) => {
    const createdAtDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (createdAtDiff !== 0) return createdAtDiff;
    const sourceDiff = SOURCE_ORDER[a.type] - SOURCE_ORDER[b.type];
    if (sourceDiff !== 0) return sourceDiff;
    return b.id - a.id;
  });

  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const pageItems = items.slice(0, limit);
  const nextItem = items[limit];
  const nextCursor = nextItem
    ? encodeCursor({
      createdAt: nextItem.createdAt,
      id: nextItem.id,
      type: nextItem.type,
    })
    : null;

  const partialFailure = unavailableSources.length > 0;

  return {
    data: pageItems,
    meta: {
      cursor: nextCursor,
      limit,
      partialFailure,
      unavailableSources,
    },
  };
}

export function encodeOperationsCursorForTests(payload: OperationsCursorPayload): string {
  return encodeCursor(payload);
}

export function decodeOperationsCursorForTests(cursor: string): OperationsCursorPayload {
  return decodeCursor(cursor);
}
