/**
 * Canonical paginated-response metadata.
 *
 * Mirrors the shape produced by `paginate()` in `@propertypro/db`
 * (see packages/db/src/pagination.ts:67-83). Duplicated here so this package
 * has zero workspace dependencies and can be consumed by clients without
 * pulling in the database layer.
 *
 * If `paginate()`'s shape ever changes, update both places.
 */
export interface PaginationResult {
  /** Cursor for the next page. `null` when this is the last page. */
  nextCursor: string | null;
  /** Convenience: `true` iff `nextCursor !== null`. */
  hasMore: boolean;
  /** Effective page size used for this query (after clamping). */
  pageSize: number;
}
