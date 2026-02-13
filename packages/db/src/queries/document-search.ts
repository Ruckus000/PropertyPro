import { and, desc, eq, gte, ilike, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import type { CommunityRole, CommunityType } from '@propertypro/shared';
import { createScopedClient } from '../scoped-client';
import { documents } from '../schema/documents';
import { buildDocumentAccessFilter } from './document-access';

export interface DocumentSearchParams {
  communityId: number;
  query?: string | null;
  categoryId?: number | null;
  mimeType?: string | null;
  createdFrom?: Date | null;
  createdTo?: Date | null;
  cursor?: number | null;
  limit?: number;
  /** If provided, filters documents based on role-based access control */
  role?: CommunityRole;
  /** Required with role to apply strict role x community_type policy filters */
  communityType?: CommunityType;
}

export interface DocumentSearchItem {
  id: number;
  communityId: number;
  categoryId: number | null;
  title: string;
  description: string | null;
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string | null;
  searchText: string | null;
  createdAt: Date;
  updatedAt: Date;
  rank: number;
}

export interface DocumentSearchResult {
  data: DocumentSearchItem[];
  nextCursor: number | null;
}

function combineFilters(filters: SQL[]): SQL | undefined {
  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  return and(...filters);
}

export async function searchDocuments(params: DocumentSearchParams): Promise<DocumentSearchResult> {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const textQuery = params.query?.trim() ?? '';
  const hasTextQuery = textQuery.length > 0;

  const vectorExpr = sql`coalesce(
    ${documents.searchVector},
    to_tsvector(
      'english',
      coalesce(${documents.searchText}, '') || ' ' ||
      coalesce(${documents.title}, '') || ' ' ||
      coalesce(${documents.description}, '')
    )
  )`;
  const tsQueryExpr = sql`plainto_tsquery('english', ${textQuery})`;
  const rankExpr = hasTextQuery
    ? sql<number>`ts_rank(${vectorExpr}, ${tsQueryExpr})`
    : sql<number>`0`;

  const additionalFilters: SQL[] = [];
  if (params.categoryId != null) {
    additionalFilters.push(eq(documents.categoryId, params.categoryId));
  }
  if (params.mimeType) {
    additionalFilters.push(eq(documents.mimeType, params.mimeType));
  }
  if (params.createdFrom) {
    additionalFilters.push(gte(documents.createdAt, params.createdFrom));
  }
  if (params.createdTo) {
    additionalFilters.push(lte(documents.createdAt, params.createdTo));
  }
  if (params.cursor != null) {
    additionalFilters.push(lt(documents.id, params.cursor));
  }

  if (params.role && params.communityType) {
    const accessFilter = await buildDocumentAccessFilter({
      communityId: params.communityId,
      role: params.role,
      communityType: params.communityType,
    });
    if (accessFilter) {
      additionalFilters.push(accessFilter);
    }
  }

  if (hasTextQuery) {
    const like = `%${textQuery}%`;
    additionalFilters.push(
      or(
        sql`${vectorExpr} @@ ${tsQueryExpr}`,
        ilike(documents.title, like),
        ilike(documents.description, like),
      ) as SQL,
    );
  }

  const scoped = createScopedClient(params.communityId);
  const base = scoped.selectFrom(
    documents,
    {
      id: documents.id,
      communityId: documents.communityId,
      categoryId: documents.categoryId,
      title: documents.title,
      description: documents.description,
      filePath: documents.filePath,
      fileName: documents.fileName,
      fileSize: documents.fileSize,
      mimeType: documents.mimeType,
      uploadedBy: documents.uploadedBy,
      searchText: documents.searchText,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      rank: rankExpr,
    },
    combineFilters(additionalFilters),
  );

  const rows = hasTextQuery
    ? await base.orderBy(desc(rankExpr), desc(documents.id)).limit(limit + 1)
    : await base.orderBy(desc(documents.id)).limit(limit + 1);

  const hasMore = rows.length > limit;
  const visibleRows = (hasMore ? rows.slice(0, limit) : rows) as unknown as DocumentSearchItem[];
  const nextCursor = hasMore ? visibleRows[visibleRows.length - 1]?.id ?? null : null;

  return {
    data: visibleRows,
    nextCursor,
  };
}
