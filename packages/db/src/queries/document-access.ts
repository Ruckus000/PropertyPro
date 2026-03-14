import {
  and,
  eq,
  inArray,
  isNotNull,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { CommunityRole, CommunityType, NewCommunityRole, ManagerPermissions } from '@propertypro/shared';
import {
  getAccessibleKnownCategories,
  isElevatedRole,
  normalizeCategoryName,
  type KnownDocumentCategoryKey,
} from '@propertypro/shared';
import { createScopedClient } from '../scoped-client';
import { documentCategories } from '../schema/document-categories';
import { documents } from '../schema/documents';

export interface DocumentAccessContext {
  communityId: number;
  role: CommunityRole | NewCommunityRole;
  communityType: CommunityType;
  isUnitOwner?: boolean;
  permissions?: ManagerPermissions;
}

async function getAllowedCategoryIds(
  context: DocumentAccessContext,
): Promise<number[]> {
  const allowedKeys = new Set<KnownDocumentCategoryKey>(
    getAccessibleKnownCategories(context.role, context.communityType, {
      isUnitOwner: context.isUnitOwner,
      permissions: context.permissions,
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
  if (isElevatedRole(context.role, { isUnitOwner: context.isUnitOwner, permissions: context.permissions })) {
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
  const scoped = createScopedClient(context.communityId);
  const accessFilter = await buildDocumentAccessFilter(context);

  const combinedFilter = accessFilter && additionalFilter
    ? and(accessFilter, additionalFilter)
    : accessFilter ?? additionalFilter;

  // Use selectFrom which auto-applies community_id and deleted_at scoping
  return scoped.selectFrom(documents, {}, combinedFilter);
}

export async function getDocumentWithAccessCheck(
  context: DocumentAccessContext,
  documentId: number,
): Promise<Record<string, unknown> | null> {
  const scoped = createScopedClient(context.communityId);
  const accessFilter = await buildDocumentAccessFilter(context);
  const idFilter = eq(documents.id, documentId);
  const combinedFilter = accessFilter ? and(idFilter, accessFilter) : idFilter;

  // Use selectFrom which auto-applies community_id and deleted_at scoping
  const rows = await scoped
    .selectFrom(documents, {}, combinedFilter)
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

