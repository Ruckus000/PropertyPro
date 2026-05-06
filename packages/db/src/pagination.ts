/**
 * Canonical pagination contract (Plan A2 / ADR-003).
 *
 * Cursor-based keyset pagination on the table's `id` column. The single
 * sanctioned way to return a list of rows from a `/api/v1/*` route handler.
 *
 * Why cursor (not offset):
 *   - Stable under inserts/deletes (offset shifts on every change)
 *   - O(log n) via the primary-key index (offset is O(n) for deep pages)
 *   - Maps naturally to keyset SQL using the existing `id` PK
 *
 * Default page size: {@link DEFAULT_PAGE_SIZE}. Hard cap: {@link MAX_PAGE_SIZE}.
 * Anything larger is clamped silently — clients cannot ask for more.
 *
 * Usage from a route handler:
 *
 * ```ts
 * import { createScopedClient, paginate, announcements } from '@propertypro/db';
 *
 * const scoped = createScopedClient(communityId);
 * const result = await paginate<AnnouncementRow>(scoped, announcements, {
 *   cursor: parsed.data.cursor,
 *   pageSize: parsed.data.pageSize,
 * });
 * return NextResponse.json(result);
 * ```
 *
 * Response envelope: `{ data, pagination: { nextCursor, hasMore, pageSize } }`.
 */
import { type SQL, and, asc, desc, getTableColumns, getTableName, gt, lt } from 'drizzle-orm';
import type { PgColumn, PgTable, TableConfig } from 'drizzle-orm/pg-core';
import type { ScopedClient, ScopedRow, ScopedTable } from './types/scoped-client';

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Default page size when none is supplied. */
export const DEFAULT_PAGE_SIZE = 50;

/** Hard upper bound — clients asking for more get silently clamped. */
export const MAX_PAGE_SIZE = 100;

/** Lower bound — anything below 1 is clamped to 1. */
const MIN_PAGE_SIZE = 1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input shape accepted by {@link paginate}. */
export interface PaginationInput {
  /**
   * Opaque cursor returned by a previous call. Omit (or pass null/undefined)
   * for the first page. Cursor format is internal — never construct one
   * client-side.
   */
  cursor?: string | null | undefined;

  /**
   * Requested page size. Clamped to [{@link MIN_PAGE_SIZE}, {@link MAX_PAGE_SIZE}]
   * with a default of {@link DEFAULT_PAGE_SIZE} when omitted.
   */
  pageSize?: number | null | undefined;
}

/** Pagination metadata included in every paginated response. */
export interface PaginationResult {
  /**
   * Cursor for fetching the next page. `null` when this was the last page.
   * Pass back as {@link PaginationInput.cursor} on the subsequent call.
   */
  nextCursor: string | null;

  /** Convenience: `true` iff `nextCursor !== null`. */
  hasMore: boolean;

  /**
   * The effective page size used for this query (after clamping). Useful for
   * UI to know what was actually returned.
   */
  pageSize: number;
}

/** Canonical envelope for any paginated list response. */
export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationResult;
}

/** Sort direction. Default is `desc` (newest first by `id`). */
export type PaginationDirection = 'asc' | 'desc';

/** Optional configuration for {@link paginate}. */
export interface PaginateOptions {
  /**
   * Additional WHERE predicate AND-ed with the scope filter and the cursor
   * predicate. Build with helpers from `@propertypro/db/filters`.
   */
  where?: SQL | undefined;

  /**
   * Sort direction by `id`. `desc` (default) returns newest first, which is
   * what most list endpoints want.
   */
  direction?: PaginationDirection;
}

// ---------------------------------------------------------------------------
// Cursor encoding (internal — opaque to callers)
// ---------------------------------------------------------------------------

interface CursorPayload {
  /** Last seen `id` from the previous page. */
  id: number;
}

/**
 * Encode a numeric `id` into an opaque cursor string. Base64url over a small
 * JSON payload. The format is internal — the only contract is that
 * {@link decodeCursor} is the inverse of {@link encodeCursor}.
 */
export function encodeCursor(id: number): string {
  const payload: CursorPayload = { id };
  const json = JSON.stringify(payload);
  // Buffer is available in both Node (server) and Edge runtimes.
  return Buffer.from(json, 'utf8').toString('base64url');
}

/**
 * Decode a cursor string. Returns null if the cursor is malformed or
 * obviously out of range — paginate() treats null as "first page".
 *
 * We are deliberately permissive: a stale cursor from an old client should
 * not crash the request; it just resets to the first page.
 */
export function decodeCursor(cursor: string | null | undefined): CursorPayload | null {
  if (!cursor) return null;
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { id?: unknown }).id === 'number' &&
      Number.isFinite((parsed as { id: number }).id) &&
      Number.isInteger((parsed as { id: number }).id)
    ) {
      return { id: (parsed as { id: number }).id };
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Page-size clamping
// ---------------------------------------------------------------------------

/**
 * Clamp a caller-supplied page size into [MIN_PAGE_SIZE, MAX_PAGE_SIZE].
 * Non-finite, non-integer, or missing values fall back to DEFAULT_PAGE_SIZE.
 *
 * Exported for tests and for routes that need to surface the effective size
 * before calling {@link paginate} (e.g. for the `pageSize` field of a Zod
 * response schema).
 */
export function clampPageSize(input: number | null | undefined): number {
  if (input === null || input === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isFinite(input)) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(input)) return DEFAULT_PAGE_SIZE;
  if (input < MIN_PAGE_SIZE) return MIN_PAGE_SIZE;
  if (input > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
  return input;
}

// ---------------------------------------------------------------------------
// paginate()
// ---------------------------------------------------------------------------

/**
 * Returns a single page of rows from a tenant-scoped table, plus the cursor
 * needed for the next page.
 *
 * Implementation:
 *   1. Clamp `pageSize` to the allowed range.
 *   2. Decode the (opaque) cursor; treat malformed cursors as "first page".
 *   3. Build a keyset predicate against `table.id` using the cursor.
 *   4. Run a scoped `SELECT * FROM table WHERE <scope> AND <cursor> AND <user where>
 *      ORDER BY id <direction> LIMIT pageSize + 1`.
 *   5. If we got `pageSize + 1` rows, the extra row is the look-ahead — drop
 *      it from `data` and emit a cursor pointing at the last *kept* row.
 *
 * The scoped client enforces tenant isolation and soft-delete filtering on
 * top of whatever predicate this helper supplies, so misuse cannot leak
 * cross-tenant data.
 *
 * @throws if `table` has no `id` column.
 */
export async function paginate<T extends ScopedRow = ScopedRow>(
  scoped: ScopedClient,
  table: ScopedTable,
  input: PaginationInput = {},
  options: PaginateOptions = {},
): Promise<PaginatedResult<T>> {
  const pageSize = clampPageSize(input.pageSize);
  const cursor = decodeCursor(input.cursor);
  const direction: PaginationDirection = options.direction ?? 'desc';

  // Locate the `id` column. Drizzle returns the column metadata via
  // getTableColumns(); we use string indexing for runtime safety.
  const columns = getTableColumns(table) as Record<string, PgColumn>;
  const idColumn = columns['id'];
  if (!idColumn) {
    throw new Error(
      `paginate(): table "${getTableName(table)}" has no 'id' column. ` +
        `This helper only supports tables with a numeric primary key.`,
    );
  }

  // Cursor predicate: "give me rows with an id strictly past the last seen".
  const cursorPredicate: SQL | undefined = cursor
    ? direction === 'desc'
      ? lt(idColumn, cursor.id)
      : gt(idColumn, cursor.id)
    : undefined;

  // Combine cursor predicate with caller's `where`, if both present.
  const combinedWhere: SQL | undefined =
    cursorPredicate && options.where
      ? (and(cursorPredicate, options.where) as SQL | undefined)
      : (cursorPredicate ?? options.where);

  // Run the scoped query with one extra row as a look-ahead. The +1 trick
  // lets us answer `hasMore` without a second COUNT query.
  const builder = scoped.selectFrom<T>(table as PgTable<TableConfig>, columns, combinedWhere);
  const orderFn = direction === 'desc' ? desc : asc;
  const rows = await builder.orderBy(orderFn(idColumn)).limit(pageSize + 1).then((r) => r);

  const hasMore = rows.length > pageSize;
  const data = hasMore ? rows.slice(0, pageSize) : rows;

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = data[data.length - 1] as ScopedRow | undefined;
    const lastId = last?.['id'];
    if (typeof lastId === 'number') {
      nextCursor = encodeCursor(lastId);
    }
  }

  return {
    data,
    pagination: {
      nextCursor,
      hasMore: nextCursor !== null,
      pageSize,
    },
  };
}
