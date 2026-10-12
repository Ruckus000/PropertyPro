/**
 * Import Residents Service
 *
 * Tenant-scoped helpers for the bulk-import route at
 * /api/v1/import-residents. The route loads its lookup maps up-front to avoid
 * per-row N+1 lookups during the import loop. Units and user_roles are
 * community-scoped, so those are full reads of this community's rows. `users`
 * is platform-global, so that map is built from the CSV's own emails instead.
 *
 * Writes go through `importResidentRow`: one transaction per row.
 *
 * Companion to:
 *   - apps/web/src/app/api/v1/import-residents/route.ts
 *   - apps/web/src/lib/services/resident-import-plan.ts (the read-only plan)
 */
import { createScopedClient, units, userRoles, users } from '@propertypro/db';
import { inArray, sql } from '@propertypro/db/filters';
// AUTHZ: importResidentRowOp writes one planned row (user, membership, prefs, audit) in one transaction; the route has verified membership + residents:write and planResidentImport has run the cross-tenant attach guard for every existing account.
import { importResidentRowOp } from '@propertypro/db/unsafe';
import { chunk } from '@/lib/utils/chunk';

/**
 * Emails per `IN (...)` lookup. Each email is one bind parameter and Postgres
 * caps a statement at 65,535. The validator caps a file at
 * `RESIDENT_IMPORT_MAX_ROWS` (2,000), so this is one chunk today; it stays
 * chunked so raising that cap cannot break the lookup. Chunks run
 * sequentially, never in parallel (the pool is 3).
 */
const EMAIL_LOOKUP_CHUNK = 1000;

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
 * Build a `lower(email) → user_id` map covering the given (lower-cased) emails.
 *
 * `users` has no `community_id`, so a match may belong to ANY community — the
 * route must still run the cross-tenant attach guard on every hit.
 */
export async function loadUserEmailMapForImport(
  communityId: number,
  emails: string[],
): Promise<Map<string, string>> {
  const scoped = createScopedClient(communityId);
  const map = new Map<string, string>();
  for (const batch of chunk(emails, EMAIL_LOOKUP_CHUNK)) {
    const rows = await scoped.selectFrom<{ id: string; email: string }>(
      users,
      { id: users.id, email: users.email },
      inArray(sql`lower(${users.email})`, batch),
    );
    for (const row of rows) {
      map.set(row.email.toLowerCase(), row.id);
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
 * Import one planned row in a single transaction: the user (only when
 * `existingUserId` is null), the resident membership, notification
 * preferences for this community, and the audit entry. A row is either fully
 * imported and audited, or nothing of it is written (onboarding audit F2).
 * Returns the user id; throws, having written nothing, on any failure.
 *
 * AUTHZ: caller MUST have verified community membership +
 * `requirePermission('residents', 'write')`, and the row MUST come from
 * `planResidentImport` in the same request — that is where the cross-tenant
 * attach guard ran for `existingUserId`.
 */
export async function importResidentRow(input: {
  communityId: number;
  actorUserId: string;
  email: string;
  fullName: string;
  existingUserId: string | null;
  isUnitOwner: boolean;
  unitId: number | null;
  displayTitle: string;
  legacyRole: string;
  /** Rows this import attempted; stamped on every row's audit entry. */
  bulkCount: number;
}): Promise<string> {
  return importResidentRowOp({
    communityId: input.communityId,
    actorUserId: input.actorUserId,
    email: input.email,
    ...(input.existingUserId
      ? { existingUserId: input.existingUserId }
      : { newUser: { fullName: input.fullName } }),
    role: 'resident',
    isUnitOwner: input.isUnitOwner,
    unitId: input.unitId,
    displayTitle: input.displayTitle,
    legacyRole: input.legacyRole,
    auditMetadata: { bulkCount: input.bulkCount },
  });
}
