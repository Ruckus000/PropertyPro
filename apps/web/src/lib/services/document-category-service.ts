/**
 * Document Category Service
 *
 * Tenant-scoped lookups for the `document_categories` table. Helpers here
 * are used to resolve category metadata (name, etc.) for documents that
 * have already been authorized at the route layer.
 */
import { createScopedClient, documentCategories, paginate } from '@propertypro/db';
import { inArray } from '@propertypro/db/filters';

export interface DocumentCategoryListItem {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
}

export interface PaginatedDocumentCategories {
  data: DocumentCategoryListItem[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    pageSize: number;
  };
}

function toCategorySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Cursor-paginated list of document categories for a community. Each row is
 * mapped to the public `DocumentCategoryListItem` shape (adds derived
 * `slug`). See ADR-003 / Plan A2 for the canonical paginate envelope.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership.
 */
export async function paginateDocumentCategories(params: {
  communityId: number;
  cursor?: string;
  pageSize?: number;
}): Promise<PaginatedDocumentCategories> {
  const scoped = createScopedClient(params.communityId);
  const result = await paginate(scoped, documentCategories, {
    cursor: params.cursor,
    pageSize: params.pageSize,
  });

  const data = result.data.map((row) => {
    const name = row['name'] as string;
    return {
      id: row['id'] as number,
      name,
      slug: toCategorySlug(name),
      description: (row['description'] as string | null) ?? null,
      isSystem: row['isSystem'] as boolean,
    };
  });

  return { data, pagination: result.pagination };
}

/**
 * List EVERY category name in the community keyed by id. Used by callers
 * that need a complete lookup table (e.g. document picker UIs) and don't
 * have a pre-narrowed id set to filter on.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership.
 */
export async function listAllDocumentCategoryNames(
  communityId: number,
): Promise<Map<number, string>> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(documentCategories, {
    id: documentCategories.id,
    name: documentCategories.name,
  })) as unknown as Array<{ id: unknown; name: unknown }>;
  const result = new Map<number, string>();
  for (const row of rows) {
    const id = Number(row.id);
    if (Number.isFinite(id)) result.set(id, String(row.name ?? ''));
  }
  return result;
}

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
