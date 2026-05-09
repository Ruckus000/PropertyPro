/**
 * Documents Service
 *
 * Tenant-scoped lookups + writes for the `documents` table backing
 * /api/v1/documents (GET list + DELETE soft-delete). Companion to
 * `document-category-service` (categories) and `document-draft-service`
 * (drafts subtree).
 *
 * Pre-A3-drain-#62 the DELETE handler used `scoped.query(documents)` +
 * JS `.find()` to read audit-log metadata for one row. Replaced here with
 * `selectFrom(table, projection, eq(id, ...))`. Same class of fix as
 * drains #244/#287/#292/#295/#60/#61.
 */
import {
  buildAccessibleDocumentsFilter,
  createScopedClient,
  documents,
  paginate,
  type DocumentAccessContext,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

/**
 * Cursor-paginated list of documents the actor is allowed to see in a
 * community. Combines the per-role access filter (built by the canonical
 * `buildAccessibleDocumentsFilter`) with the optional `categoryId` match.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership.
 */
export async function paginateAccessibleDocuments(params: {
  filter: DocumentAccessContext;
  categoryId?: number | null;
  cursor?: string;
  pageSize?: number;
}) {
  const extraClause =
    params.categoryId != null ? eq(documents.categoryId, params.categoryId) : undefined;
  const where = await buildAccessibleDocumentsFilter(params.filter, extraClause);

  const scoped = createScopedClient(params.filter.communityId);
  return paginate(
    scoped,
    documents,
    { cursor: params.cursor, pageSize: params.pageSize },
    { where },
  );
}

export interface DocumentDeletionAudit {
  title: string | null;
  categoryId: number | null;
  filePath: string | null;
  fileName: string | null;
}

/**
 * Fetch the minimal document projection needed for an audit-log entry on
 * delete. Returns `null` when no row matches.
 *
 * Replaces the route's prior `scoped.query(documents)` + JS `.find()`
 * (full-table fetch) with a one-row indexed lookup.
 */
export async function getDocumentForDeletionAudit(
  communityId: number,
  documentId: number,
): Promise<DocumentDeletionAudit | null> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    documents,
    {
      title: documents.title,
      categoryId: documents.categoryId,
      filePath: documents.filePath,
      fileName: documents.fileName,
    },
    eq(documents.id, documentId),
  )) as unknown as Array<DocumentDeletionAudit>;
  return rows[0] ?? null;
}

/**
 * Soft-delete a document by id. Returns the affected rows so the caller
 * can detect the no-op case (already deleted, or no matching row) and
 * surface the right error.
 */
export async function softDeleteDocument(
  communityId: number,
  documentId: number,
): Promise<Record<string, unknown>[]> {
  const scoped = createScopedClient(communityId);
  return (await scoped.softDelete(
    documents,
    eq(documents.id, documentId),
  )) as unknown as Array<Record<string, unknown>>;
}
