import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../drizzle';
import { communities, type Community } from '../schema';

/**
 * Looks up a community by slug without tenant scoping.
 * Used for public routes that need to resolve tenant context before auth.
 */
export async function findCommunityBySlugUnscoped(
  slug: string,
): Promise<Community | null> {
  const rows = await db
    .select()
    .from(communities)
    .where(and(eq(communities.slug, slug), isNull(communities.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}
