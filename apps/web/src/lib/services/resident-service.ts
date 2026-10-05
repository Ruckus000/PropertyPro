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
import { and, eq, inArray, sql } from '@propertypro/db/filters';
// AUTHZ: listResidentsForCommunity's callers verify residents:read for this community first.
import { findCommunityResidentPortalActivity } from '@propertypro/db/unsafe';
import { expandTransitionRoleFilter } from '@propertypro/shared';

type RoleFilter = {
  role?: string;
  roles?: string[];
};

/**
 * - `active`: has signed in to the portal at least once.
 * - `invited`: sent an invitation (or approved via access request, which emails
 *   a login link) but has never signed in.
 * - `not_invited`: on file, never invited, never signed in.
 */
export type ResidentPortalStatus = 'active' | 'invited' | 'not_invited';

export interface ResidentListRow {
  userId: string;
  communityId: number;
  roleId: number;
  role: string;
  unitId: number | null;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  /** Owner vs tenant; only meaningful when role = 'resident'. */
  isUnitOwner: boolean;
  /** Board designation — display only here; statutory gates read it elsewhere. */
  designation: 'board_president' | 'board_member' | null;
  /**
   * Portal activity — managers only (`includePortalActivity`). Absent for
   * everyone else: a neighbour's sign-in history is not theirs to see.
   */
  portalStatus?: ResidentPortalStatus;
  lastSignInAt?: string | null;
  lastInvitedAt?: string | null;
  createdAt: unknown;
  /**
   * Version of this membership for optimistic concurrency: the `user_roles`
   * row's `updatedAt`. PATCH /api/v1/residents bumps it on every edit made
   * there (name and phone included), so two managers editing the same person
   * cannot silently overwrite each other.
   */
  updatedAt: unknown;
}

export function derivePortalStatus(activity: {
  lastSignInAt: Date | null;
  lastInvitedAt: Date | null;
  accessApprovedAt: Date | null;
} | undefined): ResidentPortalStatus {
  if (activity?.lastSignInAt) return 'active';
  if (activity?.lastInvitedAt || activity?.accessApprovedAt) return 'invited';
  return 'not_invited';
}

function toDesignation(value: unknown): ResidentListRow['designation'] {
  return value === 'board_president' || value === 'board_member' ? value : null;
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
 * `includePortalActivity` (sign-in / invitation history, read from
 * `auth.users`) is for management only: residents hold `residents:read` too.
 */
export async function listResidentsForCommunity(
  communityId: number,
  filter: RoleFilter = {},
  { includePortalActivity = false }: { includePortalActivity?: boolean } = {},
): Promise<ResidentListRow[]> {
  const scoped = createScopedClient(communityId);

  let roleRows: Array<Record<string, unknown>>;
  // role-v3: expandTransitionRoleFilter is an identity map over the three v3 roles — it expands nothing.
  if (filter.roles && filter.roles.length > 0) {
    const expanded = [...new Set(filter.roles.flatMap((r) => expandTransitionRoleFilter(r)))];
    if (expanded.length === 0) {
      return [];
    }
    roleRows = await scoped.selectFrom(
      userRoles,
      {},
      inArray(userRoles.role, expanded),
    ) as Array<Record<string, unknown>>;
  } else if (filter.role) {
    const expanded = [...expandTransitionRoleFilter(filter.role)];
    if (expanded.length === 0) {
      return [];
    }
    roleRows = await scoped.selectFrom(
      userRoles,
      {},
      inArray(userRoles.role, expanded),
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

  const activityByUser = includePortalActivity
    ? await findCommunityResidentPortalActivity(communityId)
    : null;

  return roleRows.map((roleRow) => {
    const userId = roleRow['userId'] as string;
    const userRow = userMap.get(userId);
    const activity = activityByUser?.get(userId);

    return {
      userId,
      communityId,
      roleId: roleRow['id'] as number,
      role: roleRow['role'] as string,
      unitId: (roleRow['unitId'] as number | null) ?? null,
      email: (userRow?.['email'] as string | undefined) ?? null,
      fullName: (userRow?.['fullName'] as string | undefined) ?? null,
      phone: (userRow?.['phone'] as string | undefined) ?? null,
      isUnitOwner: roleRow['isUnitOwner'] === true,
      designation: toDesignation(roleRow['designation']),
      ...(activityByUser
        ? {
            portalStatus: derivePortalStatus(activity),
            lastSignInAt: activity?.lastSignInAt?.toISOString() ?? null,
            lastInvitedAt:
              [activity?.lastInvitedAt, activity?.accessApprovedAt]
                .filter((d): d is Date => d instanceof Date)
                .sort((a, b) => b.getTime() - a.getTime())[0]
                ?.toISOString() ?? null,
          }
        : {}),
      createdAt: roleRow['createdAt'],
      updatedAt: roleRow['updatedAt'],
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
  // A new number is unverified until it goes through phone/verify (same rule
  // as updateUserProfile): keep phoneVerifiedAt only when the number is
  // unchanged. `users` is platform-level, so without this a manager editing a
  // resident here would re-point every community's "verified" emergency SMS.
  const update =
    // `!== undefined`, not `in`: drizzle's .set() drops an undefined phone, so
    // `{ phone: undefined }` must not erase verification of an unchanged number.
    values['phone'] !== undefined
      ? {
          ...values,
          phoneVerifiedAt: sql`case when ${users.phone} is not distinct from ${values['phone'] ?? null} then ${users.phoneVerifiedAt} else null end`,
        }
      : values;
  await scoped.update(users, update, eq(users.id, userId));
}

/**
 * Update a community role row. `updatedAt` is always bumped (scoped update).
 *
 * With `expectedUpdatedAt` (optimistic concurrency) the write applies only if
 * the row is unchanged since the caller read it, compared at millisecond
 * precision (what JSON carries; `defaultNow()` stores microseconds). Every
 * scoped write moves `updatedAt` at least 1ms forward, so a later write never
 * shares the token's millisecond. Returns false when someone else saved in
 * between.
 */
export async function updateResidentRole(
  communityId: number,
  userId: string,
  values: Record<string, unknown>,
  expectedUpdatedAt?: string,
): Promise<boolean> {
  const scoped = createScopedClient(communityId);
  const where =
    expectedUpdatedAt === undefined
      ? eq(userRoles.userId, userId)
      : and(
          eq(userRoles.userId, userId),
          sql`date_trunc('milliseconds', ${userRoles.updatedAt}) = date_trunc('milliseconds', ${expectedUpdatedAt}::timestamptz)`,
        );
  const rows = await scoped.update(userRoles, values, where);
  return expectedUpdatedAt === undefined || (rows as unknown[]).length > 0;
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
