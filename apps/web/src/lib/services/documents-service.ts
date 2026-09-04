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
  MAX_PAGE_SIZE,
  buildAccessibleDocumentsFilter,
  buildSourceTypeFilter,
  createScopedClient,
  documents,
  paginate,
  type DocumentAccessContext,
  type PaginatedResult,
} from '@propertypro/db';
import { and, eq, inArray, isNotNull } from '@propertypro/db/filters';

/**
 * Row ceiling for the un-paginated deleted list below — the same ceiling
 * `walkPaginated` already imposes on the live list, so the Deleted column
 * cannot return more than any other documents view.
 *
 * `walkPaginated` caps at `maxPages * pageSize`, but neither is an exported
 * constant: they are inline defaults (`options.maxPages ?? 20` and
 * `options.pageSize ?? '100'`, the latter documented as paginate's
 * `MAX_PAGE_SIZE`). The page size is therefore imported and only the page
 * count is restated here.
 */
const WALK_PAGINATED_MAX_PAGES = 20;
const DELETED_DOCUMENTS_ROW_CAP = WALK_PAGINATED_MAX_PAGES * MAX_PAGE_SIZE;

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
 *
 * NOT cursor-paginated, and it cannot be. `paginate()` reads through
 * `selectFrom`, which calls `buildScopeFilters(table, communityId)` with no
 * options argument at all — so the scoped client's unconditional
 * `deleted_at IS NULL` is AND-ed with this query's `deleted_at IS NOT NULL`
 * and the SQL can never match a row. `queryWhere` is the only read that
 * forwards `{ includeSoftDeleted: true }` through to `buildScopeFilters`, and
 * it has neither LIMIT nor ORDER BY. Same shape as `listVisibleAnnouncements`,
 * which likewise drops off the SQL-pagination path when it wants deleted rows.
 *
 * What the synthesized envelope promises:
 *   - `data` is newest-first by id, matching `paginate()`'s default `desc`.
 *   - It is the WHOLE result for the community, up to
 *     {@link DELETED_DOCUMENTS_ROW_CAP} rows.
 *   - `pageSize` is how many rows this one response actually carries.
 *
 * What it does NOT promise:
 *   - `nextCursor` is ALWAYS null. There is no second page to serve, so
 *     emitting a cursor would hand the caller one this function cannot honour.
 *     `params.cursor` is accepted and ignored for the same reason — every
 *     response is the first and only page.
 *   - `hasMore` is true only when the cap truncated the result. It is an
 *     honest "there are more deleted documents than this response carries",
 *     with no way to reach them; a community that hits it needs a real
 *     sort-preserving keyset design in `packages/db`, not a bigger cap.
 */
export async function paginateDeletedDocuments(params: {
  communityId: number;
  cursor?: string;
  pageSize?: number;
}): Promise<PaginatedResult<Record<string, unknown>>> {
  const scoped = createScopedClient(params.communityId);
  // `buildSourceTypeFilter` is the same `source_type IN ('library','authored')`
  // gate the live list applies through `buildAccessibleDocumentsFilter`. It is
  // not optional here: `violation_evidence` rows back violation photos and are
  // deliberately absent from every documents view, so without it a soft-deleted
  // evidence photo would appear in the Deleted column with a Restore button
  // that files it into the library. The dead query hid this — it returned
  // nothing in every state.
  const rows = (await scoped.queryWhere(
    documents,
    and(isNotNull(documents.deletedAt), buildSourceTypeFilter()),
    { includeSoftDeleted: true },
  )) as Array<Record<string, unknown>>;

  rows.sort((a, b) => (b['id'] as number) - (a['id'] as number));
  const capped = rows.slice(0, DELETED_DOCUMENTS_ROW_CAP);

  return {
    data: capped,
    pagination: {
      nextCursor: null,
      hasMore: rows.length > DELETED_DOCUMENTS_ROW_CAP,
      pageSize: capped.length,
    },
  };
}

/**
 * Undo a soft delete. Returns the affected rows so the caller can tell a no-op
 * (already live, or no such row in this community) from a success.
 *
 * `restoreSoftDelete`, not `update`: the latter goes through
 * `buildScopeFilters`, whose unconditional `deleted_at IS NULL` contradicts the
 * `isNotNull` below and matches nothing. `restoreSoftDelete` deliberately
 * builds tenant-only filters "so we can target rows currently marked deleted",
 * which is what makes the `isNotNull` legal — it is what keeps this a restore
 * rather than a no-op touch of a live row. Same fix as
 * `restoreAnnouncementForCommunity`.
 */
export async function restoreDocument(
  communityId: number,
  documentId: number,
): Promise<Record<string, unknown>[]> {
  const scoped = createScopedClient(communityId);
  return (await scoped.restoreSoftDelete(
    documents,
    and(eq(documents.id, documentId), isNotNull(documents.deletedAt)),
  )) as unknown as Array<Record<string, unknown>>;
}
