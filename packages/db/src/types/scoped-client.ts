import type { SQL } from 'drizzle-orm';
import type { PgTable, TableConfig } from 'drizzle-orm/pg-core';

/**
 * Scoped client type surface.
 *
 * NOTE: community IDs are intentionally `number` in Phase 0 because our Drizzle
 * schema uses bigint columns with `mode: 'number'` for runtime ergonomics.
 */
export type ScopedTable = PgTable<TableConfig>;
export type ScopedRow = Record<string, unknown>;

/**
 * Dynamic query builder returned by selectFrom.
 * Supports .orderBy(), .limit(), .offset() chaining before execution.
 */
export interface ScopedDynamicBuilder<T> {
  groupBy: (...columns: unknown[]) => ScopedDynamicBuilder<T>;
  orderBy: (...columns: unknown[]) => ScopedDynamicBuilder<T>;
  limit: (n: number) => ScopedDynamicBuilder<T>;
  offset: (n: number) => ScopedDynamicBuilder<T>;
  for: (strength: 'update' | 'no key update' | 'share' | 'key share', config?: { of?: unknown }) => ScopedDynamicBuilder<T>;
  then: <R>(
    onFulfilled?: ((value: T[]) => R | PromiseLike<R>) | null,
    onRejected?: ((reason: unknown) => R | PromiseLike<R>) | null,
  ) => Promise<R>;
  [Symbol.toStringTag]: string;
}

export interface ScopedClient {
  /** The community ID this client instance is scoped to. */
  readonly communityId: number;

  /** SELECT with tenant + soft-delete scoping applied. */
  query: (table: ScopedTable) => Promise<ScopedRow[]>;

  /**
   * SELECT with tenant scoping but WITHOUT the soft-delete filter.
   * Returns rows regardless of `deletedAt` state. Intended for admin-only
   * "recycle bin" / recovery views. Callers are responsible for auth gating.
   */
  queryIncludingDeleted: (table: ScopedTable) => Promise<ScopedRow[]>;

  /**
   * SELECT a single row by its `id` primary key, with tenant scoping applied.
   * Returns `null` when no row matches. Pass `{ includeSoftDeleted: true }`
   * to match soft-deleted rows as well (requires caller auth gating).
   *
   * Throws if the table does not have an `id` column.
   */
  queryById: (
    table: ScopedTable,
    id: number,
    options?: { includeSoftDeleted?: boolean },
  ) => Promise<ScopedRow | null>;

  /**
   * SELECT rows matching a caller-supplied WHERE clause, with tenant +
   * soft-delete scoping applied on top. Prefer `queryById` when matching on
   * the primary key; use `queryWhere` for lookups keyed on non-id columns
   * (e.g. `userId`, composite filters) so the predicate runs in SQL instead
   * of a full-table scan + in-memory `.find`.
   *
   * Pass `{ includeSoftDeleted: true }` to drop the soft-delete filter, so
   * soft-deleted rows are returned and the caller can inspect `deletedAt`
   * explicitly instead of having the row silently vanish. Mirrors the option
   * on `queryById`; callers are responsible for auth gating.
   */
  queryWhere: (
    table: ScopedTable,
    additionalWhere: SQL | undefined,
    options?: { includeSoftDeleted?: boolean },
  ) => Promise<ScopedRow[]>;

  /**
   * SELECT with custom column map, tenant + soft-delete scoping applied.
   * Returns a dynamic query builder that supports .orderBy(), .limit() chaining.
   *
   * This is the preferred method for queries needing custom column selection
   * while maintaining automatic tenant scoping. Use this instead of raw db imports.
   */
  selectFrom: <T extends ScopedRow>(
    table: ScopedTable,
    columns: Record<string, unknown>,
    additionalWhere?: SQL,
  ) => ScopedDynamicBuilder<T>;

  /**
   * Build a scoped WHERE clause for advanced read queries.
   * This preserves automatic community + soft-delete scoping.
   */
  buildWhere: (table: ScopedTable, additionalWhere?: SQL) => SQL | undefined;

  /** INSERT with communityId ownership enforced by scope. Supports bulk inserts. */
  insert: (table: ScopedTable, data: ScopedRow | ScopedRow[]) => Promise<ScopedRow[]>;

  /** UPDATE with tenant + soft-delete scoping applied to WHERE. */
  update: (
    table: ScopedTable,
    data: ScopedRow,
    additionalWhere?: SQL,
  ) => Promise<ScopedRow[]>;

  /** Soft delete helper (sets deletedAt). */
  softDelete: (
    table: ScopedTable,
    additionalWhere?: SQL,
  ) => Promise<ScopedRow[]>;

  /**
   * Restore a soft-deleted row (clears deletedAt).
   * Bypasses the default `deletedAt IS NULL` scope filter so currently-deleted
   * rows can be updated. Tenant scoping is still enforced.
   */
  restoreSoftDelete: (
    table: ScopedTable,
    additionalWhere?: SQL,
  ) => Promise<ScopedRow[]>;

  /** Hard delete helper. Use sparingly for non-tenant/system data. */
  hardDelete: (
    table: ScopedTable,
    additionalWhere?: SQL,
  ) => Promise<ScopedRow[]>;
}
