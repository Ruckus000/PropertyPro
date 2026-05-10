import type { createScopedClient } from '@propertypro/db';
import { maintenanceComments, maintenanceRequests, paginate, units } from '@propertypro/db';
import { and, eq, inArray } from '@propertypro/db/filters';

type ScopedClient = ReturnType<typeof createScopedClient>;

export type MaintenanceRouteRow = Record<string, unknown>;

interface PaginateMaintenanceRequestsInput {
  scoped: ScopedClient;
  actorUserId: string;
  isResident: boolean;
  isStaff: boolean;
  cursor?: string;
  pageSize?: number;
  statusFilter: string | null;
  categoryFilter: string | null;
  priorityFilter: string | null;
  assignedToIdFilter: string | null;
}

/**
 * Paginate maintenance requests in the caller's scoped community, including
 * role-aware and query-param filter pushdown. Caller MUST verify
 * maintenance:read authorization before exposing rows.
 */
export async function paginateMaintenanceRequestsForCommunity({
  scoped,
  actorUserId,
  isResident,
  isStaff,
  cursor,
  pageSize,
  statusFilter,
  categoryFilter,
  priorityFilter,
  assignedToIdFilter,
}: PaginateMaintenanceRequestsInput): Promise<{
  data: MaintenanceRouteRow[];
  pagination: unknown;
}> {
  const conditions: ReturnType<typeof eq>[] = [];
  if (isResident) conditions.push(eq(maintenanceRequests.submittedById, actorUserId));
  if (statusFilter) {
    conditions.push(eq(
      maintenanceRequests.status,
      statusFilter as 'submitted' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed' | 'open',
    ));
  }
  if (categoryFilter) conditions.push(eq(maintenanceRequests.category, categoryFilter));
  if (priorityFilter) {
    conditions.push(eq(
      maintenanceRequests.priority,
      priorityFilter as 'low' | 'normal' | 'high' | 'urgent',
    ));
  }
  if (isStaff && assignedToIdFilter) {
    conditions.push(eq(maintenanceRequests.assignedToId, assignedToIdFilter));
  }

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

  const result = await paginate(
    scoped,
    maintenanceRequests,
    { cursor, pageSize },
    { where },
  );

  return {
    data: result.data as MaintenanceRouteRow[],
    pagination: result.pagination,
  };
}

/**
 * Fetch a maintenance request by id inside the caller's scoped community.
 * Caller MUST verify maintenance read/write authorization before exposing
 * or mutating the returned row.
 */
export async function getMaintenanceRequestById(
  scoped: ScopedClient,
  id: number,
): Promise<MaintenanceRouteRow | null> {
  const rows = await scoped.selectFrom(
    maintenanceRequests,
    {},
    eq(maintenanceRequests.id, id),
  );
  return ((rows as unknown as MaintenanceRouteRow[])[0]) ?? null;
}

/**
 * Fetch comments for a maintenance request inside the caller's scoped
 * community. Caller owns resident/internal comment filtering.
 */
export async function listMaintenanceCommentsForRequest(
  scoped: ScopedClient,
  requestId: number,
): Promise<MaintenanceRouteRow[]> {
  const rows = await scoped.selectFrom(
    maintenanceComments,
    {},
    eq(maintenanceComments.requestId, requestId),
  );
  return rows as unknown as MaintenanceRouteRow[];
}

/**
 * Fetch comments for a page of maintenance request ids. Returns an empty list
 * when the page is empty to avoid an invalid `inArray(..., [])` query.
 */
export async function listMaintenanceCommentsForRequests(
  scoped: ScopedClient,
  requestIds: readonly number[],
): Promise<MaintenanceRouteRow[]> {
  if (requestIds.length === 0) return [];
  const rows = await scoped.selectFrom(
    maintenanceComments,
    {},
    inArray(maintenanceComments.requestId, [...requestIds]),
  );
  return rows as unknown as MaintenanceRouteRow[];
}

/**
 * Fetch a unit by id for maintenance request creation. Caller MUST verify
 * maintenance:write authorization before accepting the unit association.
 */
export async function getMaintenanceRequestUnitById(
  scoped: ScopedClient,
  unitId: number,
): Promise<MaintenanceRouteRow | null> {
  const rows = await scoped.selectFrom(
    units,
    {},
    eq(units.id, unitId),
  );
  return ((rows as unknown as MaintenanceRouteRow[])[0]) ?? null;
}

/**
 * Update a maintenance request by id inside the caller's scoped community.
 * Caller MUST validate authorization, allowed transitions, and update payload.
 */
export async function updateMaintenanceRequestById(
  scoped: ScopedClient,
  id: number,
  values: Record<string, unknown>,
): Promise<MaintenanceRouteRow | undefined> {
  const rows = await scoped.update(
    maintenanceRequests,
    values,
    eq(maintenanceRequests.id, id),
  );
  return (rows as unknown as MaintenanceRouteRow[])[0];
}

/**
 * Insert a maintenance request in the caller's scoped community. Caller MUST
 * verify feature gates, maintenance:write authorization, and any unit
 * ownership/belonging checks before calling.
 */
export async function createMaintenanceRequestForCommunity(
  scoped: ScopedClient,
  values: Record<string, unknown>,
): Promise<MaintenanceRouteRow | undefined> {
  const rows = await scoped.insert(maintenanceRequests, values);
  return (rows as unknown as MaintenanceRouteRow[])[0];
}

/**
 * Insert a maintenance comment in the caller's scoped community. Caller MUST
 * verify request visibility and resident ownership before calling.
 */
export async function createMaintenanceCommentForRequest(
  scoped: ScopedClient,
  values: Record<string, unknown>,
): Promise<MaintenanceRouteRow | undefined> {
  const rows = await scoped.insert(maintenanceComments, values);
  return (rows as unknown as MaintenanceRouteRow[])[0];
}

/**
 * Soft-delete a maintenance request by id inside the caller's scoped community.
 * Caller MUST verify maintenance write authorization first.
 */
export async function softDeleteMaintenanceRequestById(
  scoped: ScopedClient,
  id: number,
): Promise<void> {
  await scoped.softDelete(maintenanceRequests, eq(maintenanceRequests.id, id));
}
