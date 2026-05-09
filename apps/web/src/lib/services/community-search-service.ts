/**
 * Community Search Service
 *
 * Cross-tenant discovery search backing the public Join-Community page.
 * Intentionally uses the unscoped client because it must query across
 * all communities; projects only public columns (name, city, state, type,
 * rounded member count). Street addresses, contact info, billing data,
 * and admin identities are NEVER returned.
 *
 * AUTHZ: public discovery endpoint — caller MUST apply per-IP rate limiting
 * BEFORE invoking. Member counts are rounded to the nearest 10 to avoid
 * exact head-count leaks.
 */
import { communities } from '@propertypro/db';
import { and, ilike, isNull, sql } from '@propertypro/db/filters';
// AUTHZ: Public community search: discovery endpoint intentionally queries across all communities, returns only minimal non-sensitive metadata. Caller MUST rate-limit per IP before invoking.
import { createUnscopedClient } from '@propertypro/db/unsafe';

export interface PublicCommunitySearchResult {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
  communityType: string;
  /** Rounded down to the nearest 10 to avoid exact head-count leaks. */
  memberCount: number;
}

/**
 * Escape LIKE wildcards so user-supplied search input cannot match all rows
 * (e.g. "%" or "_"). Backslash is the default LIKE escape char in Postgres.
 */
function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Search non-deleted communities by name (substring, case-insensitive),
 * optionally narrowed by city. Returns at most 20 rows of the public
 * projection; member counts are rounded down to the nearest 10.
 */
export async function searchPublicCommunities(params: {
  q: string;
  city?: string;
}): Promise<PublicCommunitySearchResult[]> {
  const db = createUnscopedClient();

  const conditions = [
    ilike(communities.name, `%${escapeLike(params.q)}%`),
    isNull(communities.deletedAt),
  ];
  if (params.city) {
    conditions.push(ilike(communities.city, `%${escapeLike(params.city)}%`));
  }

  const rows = await db
    .select({
      id: communities.id,
      name: communities.name,
      city: communities.city,
      state: communities.state,
      communityType: communities.communityType,
      memberCount: sql<number>`(
        SELECT COUNT(*)::int FROM user_roles ur
        WHERE ur.community_id = ${communities.id}
      )`,
    })
    .from(communities)
    .where(and(...conditions))
    .limit(20);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city,
    state: r.state,
    communityType: r.communityType,
    memberCount: Math.floor(r.memberCount / 10) * 10,
  }));
}
