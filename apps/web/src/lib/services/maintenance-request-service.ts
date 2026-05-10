import type { createScopedClient } from '@propertypro/db';
import { maintenanceComments, maintenanceRequests, userRoles } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

type ScopedClient = ReturnType<typeof createScopedClient>;

export type MaintenanceRouteRow = Record<string, unknown>;

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
 * Return whether the supplied user has a maintenance-staff role in the scoped
 * community. Caller MUST have already verified the actor can update the
 * maintenance request assignment.
 */
export async function isMaintenanceStaffAssignee(
  scoped: ScopedClient,
  userId: string,
): Promise<boolean> {
  const roleRows = await scoped.selectFrom(
    userRoles,
    {},
    eq(userRoles.userId, userId),
  ) as unknown as MaintenanceRouteRow[];
  return roleRows.some((row) => row['role'] === 'manager' || row['role'] === 'pm_admin');
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
 * Soft-delete a maintenance request by id inside the caller's scoped community.
 * Caller MUST verify maintenance write authorization first.
 */
export async function softDeleteMaintenanceRequestById(
  scoped: ScopedClient,
  id: number,
): Promise<void> {
  await scoped.softDelete(maintenanceRequests, eq(maintenanceRequests.id, id));
}
