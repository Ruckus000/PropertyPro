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

export interface ScopedClient {
  /** The community ID this client instance is scoped to. */
  readonly communityId: number;

  /** SELECT with tenant + soft-delete scoping applied. */
  query: (table: ScopedTable) => Promise<ScopedRow[]>;

  /** INSERT with communityId ownership enforced by scope. */
  insert: (table: ScopedTable, data: ScopedRow) => Promise<ScopedRow[]>;

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
