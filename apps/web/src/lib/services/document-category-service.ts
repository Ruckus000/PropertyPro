/**
 * Document Category Service
 *
 * Tenant-scoped lookups for the `document_categories` table. Helpers here
 * are used to resolve category metadata (name, etc.) for documents that
 * have already been authorized at the route layer.
 */
import { createScopedClient, documentCategories } from '@propertypro/db';
import { inArray } from '@propertypro/db/filters';

/**
 * Bulk-lookup category names by id within a community. Returns a
 * `Map<id, name>` so callers can render display names without
 * post-fetch filtering. Empty input → empty map (no DB round-trip).
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor
 * has read access to the parent documents in this community.
 */
export async function getDocumentCategoryNames(
  communityId: number,
  ids: number[],
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (ids.length === 0) return result;

  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom(
    documentCategories,
    { id: documentCategories.id, name: documentCategories.name },
    inArray(documentCategories.id, ids),
  );
  for (const row of rows) {
    if (typeof row.id === 'number' && typeof row.name === 'string') {
      result.set(row.id, row.name);
    }
  }
  return result;
}
