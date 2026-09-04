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
import { and, eq, inArray, isNotNull } from '@propertypro/db/filters';

/**
 * Resolve `deleted_at` for a specific set of document ids, INCLUDING
 * soft-deleted rows, as `documentId -> deletedAt | null`.
 *
 * Compliance needs to distinguish "document is gone" from "document is
 * live": under a normal scoped read a soft-deleted document simply drops
 * out of the result set, which is indistinguishable from a document in
 * another community. Reading it explicitly lets the compliance calculator
 * treat a deleted document as unlinked rather than silently satisfied.
 *
 * Targeted `inArray` lookup — never a full-table scan. Returns an empty map
 * for an empty id list (drizzle forbids `inArray(col, [])`).
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified membership.
 */
export async function getDocumentDeletedAtByIds(
  communityId: number,
  documentIds: readonly number[],
): Promise<Map<number, Date | null>> {
  const result = new Map<number, Date | null>();
  if (documentIds.length === 0) return result;

  const scoped = createScopedClient(communityId);
  const rows = (await scoped.queryWhere(
    documents,
    inArray(documents.id, [...documentIds]),
    { includeSoftDeleted: true },
  )) as Array<Record<string, unknown>>;

  for (const row of rows) {
    const id = row['id'] as number;
    const deletedAtRaw = row['deletedAt'] as string | Date | null;
    result.set(id, deletedAtRaw ? new Date(deletedAtRaw) : null);
  }
  return result;
}

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

export interface DocumentPublishAudit {
  title: string | null;
  categoryId: number | null;
  publicAccess: boolean;
}

/**
 * The projection the publish path needs: the category (which decides whether a
 * redaction attestation is required), the title (recorded in that attestation)
 * and the current flag (the audit entry's `oldValues`).
 *
 * Returns `null` when no row matches — the scoped client's community predicate
 * means that also covers "belongs to another community".
 */
export async function getDocumentForPublishAudit(
  communityId: number,
  documentId: number,
): Promise<DocumentPublishAudit | null> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    documents,
    {
      title: documents.title,
      categoryId: documents.categoryId,
      publicAccess: documents.publicAccess,
    },
    eq(documents.id, documentId),
  )) as unknown as Array<DocumentPublishAudit>;
  return rows[0] ?? null;
}

/**
 * The ONLY writer for `documents.public_access`.
 *
 * That flag is the sole gate between an association's record and the open
 * internet — `public-community-reader` filters on it for both the site's
 * documents block and the sitemap. Everything that decides whether the write is
 * allowed lives in the route; this just performs it.
 */
export async function setDocumentPublicAccess(
  communityId: number,
  documentId: number,
  publicAccess: boolean,
): Promise<Record<string, unknown>[]> {
  const scoped = createScopedClient(communityId);
  return (await scoped.update(
    documents,
    { publicAccess },
    eq(documents.id, documentId),
  )) as unknown as Array<Record<string, unknown>>;
}

/**
 * Soft-deleted documents, for the board's Deleted column.
 *
 * A separate path rather than a flag on `buildAccessibleDocumentsFilter`: that
 * filter is the per-role access rule every other read depends on, and widening
 * it to sometimes admit deleted rows would put "can this actor see it" and
 * "is it deleted" in one predicate. Here the two stay apart — the ROUTE gates
 * this on `documents:write`, and this query only ever returns deleted rows.
 */
export async function paginateDeletedDocuments(params: {
  communityId: number;
  cursor?: string;
  pageSize?: number;
}) {
  const scoped = createScopedClient(params.communityId);
  return paginate(
    scoped,
    documents,
    { cursor: params.cursor, pageSize: params.pageSize },
    { where: isNotNull(documents.deletedAt) },
  );
}

/**
 * Undo a soft delete. Returns the affected rows so the caller can tell a no-op
 * (already live, or no such row in this community) from a success.
 */
export async function restoreDocument(
  communityId: number,
  documentId: number,
): Promise<Record<string, unknown>[]> {
  const scoped = createScopedClient(communityId);
  return (await scoped.update(
    documents,
    { deletedAt: null },
    and(eq(documents.id, documentId), isNotNull(documents.deletedAt)),
  )) as unknown as Array<Record<string, unknown>>;
}
