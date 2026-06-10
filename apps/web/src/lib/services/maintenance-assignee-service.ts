import type { createScopedClient } from '@propertypro/db';
import { userRoles } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { ADMIN_TIER_DB_ROLES } from '@propertypro/shared';

type ScopedClient = ReturnType<typeof createScopedClient>;

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
  ) as unknown as Array<Record<string, unknown>>;
  // BILINGUAL (role-v3): collapse to v3-only at Phase 4 cleanup
  return roleRows.some((row) => (ADMIN_TIER_DB_ROLES as readonly string[]).includes(row['role'] as string));
}
