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
import { db } from '../drizzle';
import { createScopedClient } from '../scoped-client';
import { documentCategories } from '../schema/document-categories';
import { documents } from '../schema/documents';

export interface DocumentAccessContext {
  communityId: number;
  role: CommunityRole;
  communityType: CommunityType;
}

async function getAllowedCategoryIds(
  context: DocumentAccessContext,
): Promise<number[]> {
  const allowedKeys = new Set<KnownDocumentCategoryKey>(
    getAccessibleKnownCategories(context.role, context.communityType),
  );

  if (allowedKeys.size === 0) {
    return [];
  }

  const scoped = createScopedClient(context.communityId, db);
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
  if (isElevatedRole(context.role)) {
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

export async function getAccessibleDocuments(
  context: DocumentAccessContext,
  additionalFilter?: SQL,
): Promise<Record<string, unknown>[]> {
  const scoped = createScopedClient(context.communityId, db);
  const accessFilter = await buildDocumentAccessFilter(context);

  const combinedFilter = accessFilter && additionalFilter
    ? and(accessFilter, additionalFilter)
    : accessFilter ?? additionalFilter;

  const where = scoped.buildWhere(documents, combinedFilter);
  return db
    .select()
    .from(documents)
    .where(where);
}

export async function getDocumentWithAccessCheck(
  context: DocumentAccessContext,
  documentId: number,
): Promise<Record<string, unknown> | null> {
  const scoped = createScopedClient(context.communityId, db);
  const accessFilter = await buildDocumentAccessFilter(context);
  const idFilter = eq(documents.id, documentId);
  const combinedFilter = accessFilter ? and(idFilter, accessFilter) : idFilter;
  const where = scoped.buildWhere(documents, combinedFilter);

  const rows = await db
    .select()
    .from(documents)
    .where(where)
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

