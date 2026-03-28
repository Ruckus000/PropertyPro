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

  /** Hard delete helper. Use sparingly for non-tenant/system data. */
  hardDelete: (
    table: ScopedTable,
    additionalWhere?: SQL,
  ) => Promise<ScopedRow[]>;
}
