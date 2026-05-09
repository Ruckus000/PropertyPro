/**
 * Walks a cursor-based paginated `/api/v1/*` endpoint until `hasMore` is false,
 * accumulating every row into a flat array. Companion helper to `requestJson`
 * (Plan B3).
 *
 * Use this from consumers that need the **full** result set — e.g.
 * `useDocumentCategories` resolves a category by name across all rows, and
 * `access-request-list.tsx` renders the entire pending queue. Callers that
 * paginate through a list with a "Load more" button should NOT use this
 * helper; they want one page at a time.
 *
 * Defaults pull at the maximum allowed page size (100 — paginate's
 * `MAX_PAGE_SIZE`) to minimize round-trips. The `MAX_PAGES` cap of 20 is a
 * runaway-pagination safety net (cap of 2000 rows, well above any realistic
 * tenant-scoped list).
 *
 * Cancellation is via the standard `AbortSignal`. In a `useEffect`, pair with
 * an `AbortController`. In a TanStack Query `queryFn`, forward the signal
 * the framework provides.
 */
import { requestJson } from './request-json';

/**
 * Inner page shape after the canonical `{ data: ... }` envelope unwrap. This
 * matches the contract of every paginated `/api/v1/*` route in the codebase
 * (post-Plan B3).
 */
export interface PaginatedPage<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    pageSize: number;
  };
}

export interface WalkPaginatedOptions {
  /** Maximum pages to walk before bailing. Defaults to 20. */
  maxPages?: number;
  /**
   * Page size to request. Defaults to '100' (paginate's `MAX_PAGE_SIZE`,
   * silently clamped if higher). Pass a smaller value for endpoints that
   * cap below 100, or to throttle bandwidth.
   */
  pageSize?: string;
  /** Optional abort signal — request is cancelled mid-walk if aborted. */
  signal?: AbortSignal;
}

/**
 * Fetch all pages of a paginated endpoint.
 *
 * @param baseUrl  Path without query string, e.g. `/api/v1/document-categories`.
 * @param baseParams  Caller-controlled query params (e.g. `{ communityId: '42' }`).
 *                    `cursor` and `pageSize` are appended by this helper.
 * @param options  See {@link WalkPaginatedOptions}.
 *
 * @example
 * ```ts
 * const items = await walkPaginated<Category>(
 *   '/api/v1/document-categories',
 *   { communityId: String(communityId) },
 *   { signal: controller.signal },
 * );
 * ```
 */
export async function walkPaginated<T>(
  baseUrl: string,
  baseParams: Record<string, string>,
  options: WalkPaginatedOptions = {},
): Promise<T[]> {
  const maxPages = options.maxPages ?? 20;
  const pageSize = options.pageSize ?? '100';
  const collected: T[] = [];
  let cursor: string | null = null;

  for (let i = 0; i < maxPages; i++) {
    // Throw rather than returning partial data on abort: TanStack Query
    // would otherwise cache the incomplete list as a successful fetch,
    // masking that the request was cancelled. fetch() itself throws
    // AbortError on aborted signals — this matches that contract.
    options.signal?.throwIfAborted?.();

    const params = new URLSearchParams({ ...baseParams, pageSize });
    if (cursor) params.set('cursor', cursor);

    const init: RequestInit | undefined = options.signal ? { signal: options.signal } : undefined;
    const page = await requestJson<PaginatedPage<T>>(`${baseUrl}?${params.toString()}`, init);

    collected.push(...page.data);
    if (!page.pagination.hasMore || !page.pagination.nextCursor) break;
    cursor = page.pagination.nextCursor;
  }

  return collected;
}

/**
 * Offset-style page-window result envelope. Matches the legacy `{ data, meta }`
 * shape returned by client API helpers like `listViolations`, `listAllRequests`,
 * `listMyRequests`, and the `useWorkOrders` queryFn (Plan B3 walk-and-slice
 * pattern: #228, #236, #237).
 */
export interface SlicedMeta {
  total: number;
  page: number;
  limit: number;
}

export interface SlicedResponse<T> {
  data: T[];
  meta: SlicedMeta;
}

export interface WalkAndSliceOptions {
  /** 1-indexed page number. Defaults to 1. */
  page?: number;
  /**
   * Page size for the JS slice. When omitted, the slice covers the full walked
   * list (effectively "show all"). When 0, also returns the full list — the
   * `limit > 0` guard in the slice math is defensive against a caller passing
   * `limit: 0` from a UI control.
   */
  limit?: number;
  /** Forwarded to `walkPaginated`. */
  signal?: AbortSignal;
  /** Forwarded to `walkPaginated`. */
  maxPages?: number;
  /** Forwarded to `walkPaginated`. Defaults to '100'. */
  pageSize?: string;
}

/**
 * Walk a paginated `/api/v1/*` endpoint, then JS-slice the result to the
 * requested `page`+`limit` window. Preserves the legacy offset-style
 * `{ data, meta: { total, page, limit } }` consumer contract while letting the
 * underlying route emit the canonical paginated envelope (Plan B3).
 *
 * `meta.total` reflects the full walked length, capped at
 * {@link walkPaginated}'s `MAX_PAGES * pageSize` (default 2000 rows). For
 * communities whose row count exceeds the cap, `meta.total` undercounts.
 *
 * Use this from any consumer that paginates server-side (page/limit URL
 * params) but wants the server to return one canonical paginated envelope per
 * request. Used by `listViolations` (#228), `useWorkOrders` (#236),
 * `listAllRequests` + `listMyRequests` (#237).
 *
 * @example
 * ```ts
 * return walkAndSlice<ViolationItem>(
 *   '/api/v1/violations',
 *   baseParams,
 *   { page: params?.page, limit: params?.limit, signal },
 * );
 * ```
 */
export async function walkAndSlice<T>(
  baseUrl: string,
  baseParams: Record<string, string>,
  options: WalkAndSliceOptions = {},
): Promise<SlicedResponse<T>> {
  const all = await walkPaginated<T>(baseUrl, baseParams, {
    signal: options.signal,
    maxPages: options.maxPages,
    pageSize: options.pageSize,
  });

  const limit = options.limit ?? all.length;
  const page = options.page ?? 1;
  const offset = Math.max(0, (page - 1) * limit);
  const data = limit > 0 ? all.slice(offset, offset + limit) : all;

  return {
    data,
    meta: { total: all.length, page, limit },
  };
}
