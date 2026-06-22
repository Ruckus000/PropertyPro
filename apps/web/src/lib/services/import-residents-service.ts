/**
 * Import Residents Service
 *
 * Tenant-scoped helpers for the bulk-import route at
 * /api/v1/import-residents. Bulk imports are intentionally full-table
 * fetches (the route loads all units / all users / all user_roles
 * up-front to avoid per-row N+1 lookups during the import loop), so the
 * helpers here mirror that intent rather than narrowing to single rows.
 *
 * Companion to:
 *   - apps/web/src/app/api/v1/import-residents/route.ts
 */
import {
  createScopedClient,
  notificationPreferences,
  units,
  userRoles,
  users,
} from '@propertypro/db';

/**
 * Build a `lower(unit_number) → unit_id` map for the import loop. Lower-case
 * normalization matches the route's prior matching logic.
 */
export async function loadUnitNumberMapForImport(
  communityId: number,
): Promise<Map<string, number>> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.query(units)) as Array<Record<string, unknown>>;
  const map = new Map<string, number>();
  for (const row of rows) {
    const number = (row['unitNumber'] as string | undefined)?.toLowerCase();
    const id = row['id'];
    if (number && typeof id === 'number') {
      map.set(number, id);
    }
  }
  return map;
}

/**
 * Build a `lower(email) → user_id` map for the import loop.
 */
export async function loadUserEmailMapForImport(
  communityId: number,
): Promise<Map<string, string>> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.query(users)) as Array<Record<string, unknown>>;
  const map = new Map<string, string>();
  for (const row of rows) {
    const email = (row['email'] as string | undefined)?.toLowerCase();
    const id = row['id'];
    if (email && typeof id === 'string') {
      map.set(email, id);
    }
  }
  return map;
}

/**
 * Build a Set<userId> of users that already have a role in this community.
 * Used to skip duplicate role creation during the import loop.
 */
export async function loadUsersWithExistingRoleForImport(
  communityId: number,
): Promise<Set<string>> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.query(userRoles)) as Array<Record<string, unknown>>;
  const set = new Set<string>();
  for (const row of rows) {
    const id = row['userId'];
    if (typeof id === 'string') set.add(id);
  }
  return set;
}

/**
 * Insert a user row during the import loop. Returns the inserted user id
 * (string), or `null` when the inserted row's id was missing/wrong-shape.
 *
 * AUTHZ: tenant-scoped — caller MUST verify community membership +
 * `requirePermission('residents', 'write')` BEFORE invoking.
 */
export async function insertUserForImport(
  communityId: number,
  params: { id: string; email: string; fullName: string },
): Promise<string | null> {
  const scoped = createScopedClient(communityId);
  const inserted = (await scoped.insert(users, {
    id: params.id,
    email: params.email,
    fullName: params.fullName,
    phone: null,
  })) as Array<Record<string, unknown>>;
  const insertedId = inserted[0]?.['id'];
  return typeof insertedId === 'string' ? insertedId : null;
}

export interface InsertUserRoleForImportInput {
  [key: string]: unknown;
  userId: string;
  role: string;
  unitId: number | null;
  isUnitOwner: boolean;
  /** Resident-tier imports never carry a board designation (role-v3 invariant 3). */
  designation?: string | null;
  displayTitle: string;
}

/**
 * Insert a user_roles row during the import loop.
 */
export async function insertUserRoleForImport(
  communityId: number,
  input: InsertUserRoleForImportInput,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.insert(userRoles, input);
}

/**
 * Insert a notification_preferences row for a newly-created user.
 * Idempotency is the caller's responsibility (route only inserts when
 * the user was just created via insertUserForImport).
 */
export async function insertNotificationPreferencesForImport(
  communityId: number,
  userId: string,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.insert(notificationPreferences, { userId });
}
