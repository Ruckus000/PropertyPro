import {
  and,
  eq,
  inArray,
  isNotNull,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { CommunityRole, CommunityType } from '@propertypro/shared';
import {
  getAccessibleKnownCategories,
  isElevatedRole,
  normalizeCategoryName,
  type KnownDocumentCategoryKey,
} from '@propertypro/shared';
import { createScopedClient } from '../scoped-client';
import { documentCategories } from '../schema/document-categories';
import { documents } from '../schema/documents';

/**
 * The source types a community user can access through normal document
 * surfaces (listing, detail, download, picker). `violation_evidence` is
 * deliberately excluded — those rows back violation photos, never the
 * documents UI.
 */
const USER_VISIBLE_SOURCE_TYPES = ['library', 'authored'] as const;

function buildSourceTypeFilter(
  sourceTypes: ReadonlyArray<typeof USER_VISIBLE_SOURCE_TYPES[number]> = USER_VISIBLE_SOURCE_TYPES,
): SQL {
  if (sourceTypes.length === 1) {
    return eq(documents.sourceType, sourceTypes[0]!);
  }
  return inArray(documents.sourceType, [...sourceTypes]);
}

export interface DocumentAccessContext {
  communityId: number;
  role: CommunityRole;
  communityType: CommunityType;
  isUnitOwner?: boolean;
}

async function getAllowedCategoryIds(
  context: DocumentAccessContext,
): Promise<number[]> {
  const allowedKeys = new Set<KnownDocumentCategoryKey>(
    getAccessibleKnownCategories(context.role, context.communityType, {
      isUnitOwner: context.isUnitOwner,
    }),
  );

  if (allowedKeys.size === 0) {
    return [];
  }

  const scoped = createScopedClient(context.communityId);
  const categories = await scoped.query(documentCategories);

  const ids: number[] = [];
  for (const category of categories) {
    const rawName = category['name'] as string | null | undefined;
    const normalized = normalizeCategoryName(rawName);
    if (normalized !== 'unknown' && allowedKeys.has(normalized)) {
      ids.push(category['id'] as number);
    }
  }
  return ids;
}

export async function buildDocumentAccessFilter(
  context: DocumentAccessContext,
): Promise<SQL | undefined> {
  if (isElevatedRole(context.role, { isUnitOwner: context.isUnitOwner })) {
    return undefined;
  }

  const allowedCategoryIds = await getAllowedCategoryIds(context);
  if (allowedCategoryIds.length === 0) {
    return sql`1 = 0`;
  }

  return and(
    isNotNull(documents.categoryId),
    inArray(documents.categoryId, allowedCategoryIds),
  ) as SQL;
}

/**
 * Returns the combined SQL `where` clause for the documents-list query —
 * source-type filter (`library`/`authored`), per-role access filter, and
 * an optional caller-supplied `additionalFilter` (e.g. categoryId match)
 * AND-ed together. Returned shape is suitable for passing to `paginate()`
 * as `{ where }` when the caller wants a paginated documents list (Plan B3).
 *
 * Returns `undefined` only when there are no clauses at all (all-elevated
 * role with no source-type or additional filter — practically never).
 */
export async function buildAccessibleDocumentsFilter(
  context: DocumentAccessContext,
  additionalFilter?: SQL,
  sourceTypes?: ReadonlyArray<typeof USER_VISIBLE_SOURCE_TYPES[number]>,
): Promise<SQL | undefined> {
  const accessFilter = await buildDocumentAccessFilter(context);
  const sourceFilter = buildSourceTypeFilter(sourceTypes);

  const combined = [sourceFilter, accessFilter, additionalFilter].filter(
    (filter): filter is SQL => filter !== undefined,
  );

  if (combined.length === 0) return undefined;
  if (combined.length === 1) return combined[0];
  return and(...combined);
}

export async function getAccessibleDocuments(
  context: DocumentAccessContext,
  additionalFilter?: SQL,
  sourceTypes?: ReadonlyArray<typeof USER_VISIBLE_SOURCE_TYPES[number]>,
): Promise<Record<string, unknown>[]> {
  const scoped = createScopedClient(context.communityId);
  const where = await buildAccessibleDocumentsFilter(context, additionalFilter, sourceTypes);

  // Use selectFrom which auto-applies community_id and deleted_at scoping
  return scoped.selectFrom(documents, {}, where);
}

export async function getDocumentWithAccessCheck(
  context: DocumentAccessContext,
  documentId: number,
  sourceTypes?: ReadonlyArray<typeof USER_VISIBLE_SOURCE_TYPES[number]>,
): Promise<Record<string, unknown> | null> {
  const scoped = createScopedClient(context.communityId);
  const accessFilter = await buildDocumentAccessFilter(context);
  const combinedFilter = [eq(documents.id, documentId), buildSourceTypeFilter(sourceTypes), accessFilter].filter(
    (filter): filter is SQL => filter !== undefined,
  );

  // Use selectFrom which auto-applies community_id and deleted_at scoping
  const rows = await scoped
    .selectFrom(
      documents,
      {},
      combinedFilter.length === 1 ? combinedFilter[0] : and(...combinedFilter),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function isDocumentAccessible(
  context: DocumentAccessContext,
  documentId: number,
): Promise<boolean> {
  const row = await getDocumentWithAccessCheck(context, documentId);
  return row != null;
}
