import {
  createScopedClient,
  maintenanceRequests,
  workOrders,
} from '@propertypro/db';
import { and, desc, eq, lt, lte, or } from '@propertypro/db/filters';
import { ValidationError } from '@/lib/api/errors';

export type OperationsSourceType = 'maintenance_request' | 'work_order';

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
      (decoded.type !== 'maintenance_request' && decoded.type !== 'work_order')
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
  const sources: OperationsSourceType[] = params.type ? [params.type] : ['maintenance_request', 'work_order'];
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
  const items: OperationsListItem[] = [];

  settled.forEach((result, index) => {
    const sourceType = sources[index]!;
    if (result.status === 'rejected') {
      unavailableSources.push(sourceType);
      return;
    }

    for (const row of result.value.slice(0, (params.limit ?? DEFAULT_LIMIT) + 1)) {
      items.push(mapSummaryRow(sourceType, row));
    }
  });

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
