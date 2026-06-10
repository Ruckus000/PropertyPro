import { and, asc, eq, isNull, notExists } from 'drizzle-orm';
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
