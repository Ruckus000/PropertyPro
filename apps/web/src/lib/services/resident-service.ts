/**
 * Resident Service
 *
 * Tenant-scoped data helpers for /api/v1/residents. Routes own validation,
 * authz, audit semantics, and response shaping; this file owns table access.
 */
import {
  communities,
  createScopedClient,
  notificationPreferences,
  userRoles,
  users,
} from '@propertypro/db';
import { eq, inArray, sql } from '@propertypro/db/filters';

type RoleFilter = {
  role?: string;
  roles?: string[];
};

export interface ResidentListRow {
  userId: string;
  communityId: number;
  roleId: number;
  role: string;
  unitId: number | null;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  createdAt: unknown;
}

export interface ResidentUserRow {
  [key: string]: unknown;
  id: string;
  email?: string | null;
  fullName?: string | null;
  phone?: string | null;
}

export interface ResidentRoleRow {
  id?: number;
  userId: string;
  role?: unknown;
  unitId?: number | null;
  isUnitOwner?: boolean | null;
  presetKey?: string | null;
  createdAt?: unknown;
  [key: string]: unknown;
}

/**
 * Fetch community type for resident role validation.
 *
 * AUTHZ: caller MUST have verified community membership for this community.
 */
export async function getResidentCommunityTypeValue(
  communityId: number,
): Promise<unknown | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<Record<string, unknown>>(
    communities,
    { communityType: communities.communityType },
    eq(communities.id, communityId),
  );
  return rows[0]?.['communityType'] ?? null;
}

/**
 * List resident role rows with optional role filtering, hydrated with user
 * profile fields.
 *
 * AUTHZ: caller MUST have verified `requirePermission('residents', 'read')`.
 */
export async function listResidentsForCommunity(
  communityId: number,
  filter: RoleFilter = {},
): Promise<ResidentListRow[]> {
  const scoped = createScopedClient(communityId);

  let roleRows: Array<Record<string, unknown>>;
  if (filter.roles && filter.roles.length > 0) {
    roleRows = await scoped.selectFrom(
      userRoles,
      {},
      inArray(userRoles.role, filter.roles as ('resident' | 'manager' | 'pm_admin')[]),
    ) as Array<Record<string, unknown>>;
  } else if (filter.role) {
    roleRows = await scoped.selectFrom(
      userRoles,
      {},
      eq(userRoles.role, filter.role as 'resident' | 'manager' | 'pm_admin'),
    ) as Array<Record<string, unknown>>;
  } else {
    roleRows = await scoped.query(userRoles) as Array<Record<string, unknown>>;
  }

  if (roleRows.length === 0) {
    return [];
  }

  const userIds = roleRows
    .map((row) => row['userId'])
    .filter((value): value is string => typeof value === 'string');

  const userRows = userIds.length > 0
    ? await scoped.selectFrom<Record<string, unknown>>(
        users,
        {
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          phone: users.phone,
        },
        inArray(users.id, userIds),
      )
    : [];

  const userMap = new Map<string, Record<string, unknown>>();
  for (const row of userRows) {
    const userId = row['id'];
    if (typeof userId === 'string') {
      userMap.set(userId, row);
    }
  }

  return roleRows.map((roleRow) => {
    const userId = roleRow['userId'] as string;
    const userRow = userMap.get(userId);

    return {
      userId,
      communityId,
      roleId: roleRow['id'] as number,
      role: roleRow['role'] as string,
      unitId: (roleRow['unitId'] as number | null) ?? null,
      email: (userRow?.['email'] as string | undefined) ?? null,
      fullName: (userRow?.['fullName'] as string | undefined) ?? null,
      phone: (userRow?.['phone'] as string | undefined) ?? null,
      createdAt: roleRow['createdAt'],
    };
  });
}

/**
 * Fetch a user by normalized email.
 *
 * AUTHZ: caller MUST have verified `requirePermission('residents', 'write')`.
 */
export async function getResidentUserByEmail(
  communityId: number,
  normalizedEmail: string,
): Promise<ResidentUserRow | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<ResidentUserRow>(
    users,
    {
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      phone: users.phone,
    },
    sql`lower(${users.email}) = lower(${normalizedEmail})`,
  );
  return rows[0] ?? null;
}

/**
 * Fetch a user by id for resident update audit values.
 *
 * AUTHZ: caller MUST have verified `requirePermission('residents', 'write')`.
 */
export async function getResidentUserById(
  communityId: number,
  userId: string,
): Promise<ResidentUserRow | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<ResidentUserRow>(
    users,
    {
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      phone: users.phone,
    },
    eq(users.id, userId),
  );
  return rows[0] ?? null;
}

/**
 * Insert a user row for a resident create flow.
 */
export async function createResidentUser(
  communityId: number,
  values: { id: string; email: string; fullName: string; phone: string | null },
): Promise<ResidentUserRow> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.insert(users, values);
  return rows[0] as unknown as ResidentUserRow;
}

/**
 * Fetch a community-scoped role row by user id.
 *
 * AUTHZ: caller MUST have verified the route operation's residents permission.
 */
export async function getResidentRoleByUserId(
  communityId: number,
  userId: string,
): Promise<ResidentRoleRow | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<ResidentRoleRow>(
    userRoles,
    {},
    eq(userRoles.userId, userId),
  );
  return rows[0] ?? null;
}

/**
 * Insert a community role row.
 */
export async function createResidentRole(
  communityId: number,
  values: Record<string, unknown>,
): Promise<ResidentRoleRow> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.insert(userRoles, values);
  return rows[0] as ResidentRoleRow;
}

/**
 * Create default notification preferences for a resident user.
 */
export async function createResidentNotificationPreferences(
  communityId: number,
  userId: string,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.insert(notificationPreferences, { userId });
}

/**
 * Update a global user row for a resident flow.
 */
export async function updateResidentUser(
  communityId: number,
  userId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.update(users, values, eq(users.id, userId));
}

/**
 * Update a community role row.
 */
export async function updateResidentRole(
  communityId: number,
  userId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.update(userRoles, values, eq(userRoles.userId, userId));
}

/**
 * Hard-delete a community role row during resident removal.
 */
export async function deleteResidentRole(
  communityId: number,
  userId: string,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.hardDelete(userRoles, eq(userRoles.userId, userId));
}
