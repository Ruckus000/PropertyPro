import { and, asc, eq, isNull, notExists } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../drizzle';
import { communities } from '../schema/communities';
import { userRoles } from '../schema/user-roles';

export interface RootlessCommunityRow {
  id: number;
  name: string;
  slug: string;
}

/**
 * Lists non-deleted communities that have NO `root_manager` role row.
 *
 * Cross-community by design (platform-admin report) — must only be exposed
 * through `@propertypro/db/unsafe` and the apps/admin platform-admin route.
 *
 * Until the claim-root flow (role-v3 Phase 2b) runs, every backfilled
 * community is rootless; this report is how platform admins track convergence.
 */
export async function findRootlessCommunities(): Promise<RootlessCommunityRow[]> {
  // No pagination: expected O(hundreds) of communities; an unbounded select is acceptable for this platform-admin report.
  return db
    .select({ id: communities.id, name: communities.name, slug: communities.slug })
    .from(communities)
    .where(
      and(
        isNull(communities.deletedAt),
        notExists(
          db
            .select({ one: userRoles.id })
            .from(userRoles)
            .where(
              and(
                eq(userRoles.communityId, communities.id),
                eq(userRoles.role, 'root_manager'),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(communities.name));
}

export interface MyRootlessCommunityRow {
  id: number;
  name: string;
  slug: string;
}

/**
 * Communities where `userId` holds `property_manager` AND no `root_manager`
 * exists. Drives the claim banner (count > 0) and the aggregated claim screen.
 *
 * Cross-community by design (a PM may manage many communities) — must only be
 * exposed through `@propertypro/db/unsafe`.
 *
 * **Authorization contract:** the resolved list is scoped to the authenticated
 * `userId`'s own property_manager memberships; callers MUST pass the active
 * session user id, never an attacker-supplied value.
 */
export async function findMyRootlessCommunities(
  userId: string,
): Promise<MyRootlessCommunityRow[]> {
  // The notExists subquery references user_roles a second time; alias it so the
  // correlated SQL is unambiguous against the joined (outer) user_roles row.
  const rootRoles = alias(userRoles, 'root_roles');
  return db
    .select({ id: communities.id, name: communities.name, slug: communities.slug })
    .from(communities)
    .innerJoin(
      userRoles,
      and(
        eq(userRoles.communityId, communities.id),
        eq(userRoles.userId, userId),
        eq(userRoles.role, 'property_manager'),
      ),
    )
    .where(
      and(
        isNull(communities.deletedAt),
        notExists(
          db
            .select({ one: rootRoles.id })
            .from(rootRoles)
            .where(
              and(
                eq(rootRoles.communityId, communities.id),
                eq(rootRoles.role, 'root_manager'),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(communities.name));
}
