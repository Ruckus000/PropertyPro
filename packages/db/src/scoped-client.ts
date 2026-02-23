/**
 * Scoped Query Builder — CRITICAL SECURITY BOUNDARY
 *
 * Automatically injects community_id and soft-delete filters on every query.
 * This is the ONLY way to access the database from application code.
 *
 * AGENTS #14: Raw db is never exported. Only createScopedClient is public.
 * AGENTS #7: community_id filter on EVERY query.
 * AGENTS #8: compliance_audit_log exempt from soft-delete filtering (append-only).
 *
 * NOTE ON TYPE ASSERTIONS:
 * This module uses `as unknown as` casts at boundaries where Drizzle's
 * deeply-nested per-table generics conflict with our generic wrapper pattern.
 * Every cast is backed by a runtime check (column introspection) that
 * guarantees correctness. The database itself also validates query shapes.
 *
 * NOTE ON COMMUNITY ID TYPE:
 * We intentionally use `number` in Phase 0 because the current Drizzle schema
 * defines bigint columns with `mode: 'number'`.
 */
import {
  type SQL,
  type Table,
  eq,
  isNull,
  and,
  getTableColumns,
  getTableName,
} from 'drizzle-orm';
import type { PgColumn, PgTable, TableConfig } from 'drizzle-orm/pg-core';
import type { TenantContext } from './tenant-context';
import type { ScopedClient, ScopedDynamicBuilder, ScopedRow } from './types/scoped-client';
import { TenantContextMissing } from './errors/TenantContextMissing';
import { db as defaultDb } from './drizzle';

export type { ScopedClient } from './types/scoped-client';

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/**
 * Thrown when a mutation (update / softDelete / hardDelete) is attempted on a
 * table that produces no scope filter — i.e. the table has no communityId
 * column and is not the communities root entity. Without a WHERE clause the
 * operation would affect ALL rows in the table, which is never correct through
 * the scoped client. Pass an explicit additionalWhere, or use the unsafe
 * escape-hatch for truly global tables (users, stripe_webhook_events, etc.).
 */
export class UnscopedMutationError extends Error {
  constructor(operation: string, tableName: string) {
    super(
      `Unscoped ${operation} attempted on table "${tableName}". ` +
      `The table has no communityId column and is not the communities root entity. ` +
      `Pass an explicit additionalWhere clause or use the unsafe escape-hatch for global tables.`,
    );
    this.name = 'UnscopedMutationError';
  }
}

// ---------------------------------------------------------------------------
// Table exemption registry
// ---------------------------------------------------------------------------

/**
 * Tables exempt from soft-delete filtering.
 * compliance_audit_log is append-only and never deleted (AGENTS #8).
 */
const SOFT_DELETE_EXEMPT_TABLES: ReadonlySet<string> = new Set([
  'compliance_audit_log',
]);

/**
 * Tables that are append-only (INSERT permitted, UPDATE/DELETE rejected).
 * compliance_audit_log must never be modified or deleted for compliance.
 * maintenance_comments are append-only — no PATCH endpoint exists for comments.
 */
const APPEND_ONLY_TABLES: ReadonlySet<string> = new Set([
  'compliance_audit_log',
  'maintenance_comments',
]);

/**
 * The communities table is the root tenant entity.
 * It has no communityId foreign-key column — isolation is enforced
 * on its own `id` column (id = communityId) as a ScopedClient special case.
 */
const COMMUNITIES_TABLE_NAME = 'communities';

// ---------------------------------------------------------------------------
// Column detection helpers
// ---------------------------------------------------------------------------

type ColumnRecord = Record<string, PgColumn>;

function hasCommunityIdColumn(
  columns: ColumnRecord,
): columns is ColumnRecord & { communityId: PgColumn } {
  return 'communityId' in columns;
}

function hasDeletedAtColumn(
  columns: ColumnRecord,
): columns is ColumnRecord & { deletedAt: PgColumn } {
  return 'deletedAt' in columns;
}

function hasUpdatedAtColumn(
  columns: ColumnRecord,
): columns is ColumnRecord & { updatedAt: PgColumn } {
  return 'updatedAt' in columns;
}

function hasIdColumn(
  columns: ColumnRecord,
): columns is ColumnRecord & { id: PgColumn } {
  return 'id' in columns;
}

// ---------------------------------------------------------------------------
// Internal Drizzle helpers — absorb Drizzle's complex generics at one point
// ---------------------------------------------------------------------------

/** The database instance type (Drizzle postgres-js). */
type DbInstance = typeof defaultDb;

/**
 * Drizzle's generic parameter for table shapes is too deep for a generic
 * wrapper. These helpers cast through `unknown` once — backed by runtime
 * column introspection — so the rest of the module stays clean.
 */

/** SELECT … FROM table [WHERE …] → rows */
async function execSelect(
  database: DbInstance,
  table: PgTable<TableConfig>,
  whereClause: SQL | undefined,
): Promise<Record<string, unknown>[]> {
  const q = (database as unknown as { select(): { from(t: unknown): { where(w: unknown): Promise<unknown[]>; then: Promise<unknown[]>['then'] } } }).select().from(table);
  const rows = whereClause ? await q.where(whereClause) : await q;
  return rows as Record<string, unknown>[];
}

/** INSERT INTO table VALUES (data) RETURNING * → rows */
async function execInsert(
  database: DbInstance,
  table: PgTable<TableConfig>,
  data: Record<string, unknown> | Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const q = (database as unknown as { insert(t: unknown): { values(d: unknown): { returning(): Promise<unknown[]> } } }).insert(table);
  const rows = await q.values(data).returning();
  return rows as Record<string, unknown>[];
}

/** UPDATE table SET data WHERE … RETURNING * → rows */
async function execUpdate(
  database: DbInstance,
  table: PgTable<TableConfig>,
  data: Record<string, unknown>,
  whereClause: SQL | undefined,
): Promise<Record<string, unknown>[]> {
  const q = (database as unknown as { update(t: unknown): { set(d: unknown): { where(w: unknown): { returning(): Promise<unknown[]> }; returning(): Promise<unknown[]> } } }).update(table);
  const chain = q.set(data);
  const rows = whereClause
    ? await chain.where(whereClause).returning()
    : await chain.returning();
  return rows as Record<string, unknown>[];
}

/** DELETE FROM table WHERE … RETURNING * → rows */
async function execDelete(
  database: DbInstance,
  table: PgTable<TableConfig>,
  whereClause: SQL | undefined,
): Promise<Record<string, unknown>[]> {
  const q = (database as unknown as { delete(t: unknown): { where(w: unknown): { returning(): Promise<unknown[]> }; returning(): Promise<unknown[]> } }).delete(table);
  const rows = whereClause
    ? await q.where(whereClause).returning()
    : await q.returning();
  return rows as Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Scope filter builder
// ---------------------------------------------------------------------------

/**
 * Build WHERE conditions for a table based on tenant context.
 * - Auto-injects community_id = ctx.communityId if table has the column
 * - Auto-injects deleted_at IS NULL if table has the column (unless exempt)
 */
function buildScopeFilters(
  table: PgTable<TableConfig>,
  communityId: number,
): SQL[] {
  const columns = getTableColumns(table) as ColumnRecord;
  const tableName = getTableName(table as unknown as Table);
  const filters: SQL[] = [];

  if (tableName === COMMUNITIES_TABLE_NAME) {
    // Root tenant entity — isolation enforced on id, not community_id
    if (hasIdColumn(columns)) {
      filters.push(eq(columns.id, communityId));
    }
  } else if (hasCommunityIdColumn(columns)) {
    filters.push(eq(columns.communityId, communityId));
  }

  if (
    hasDeletedAtColumn(columns) &&
    !SOFT_DELETE_EXEMPT_TABLES.has(tableName)
  ) {
    filters.push(isNull(columns.deletedAt));
  }

  return filters;
}

/** Combine SQL conditions into a single AND clause (or undefined if empty). */
function combineFilters(filters: SQL[]): SQL | undefined {
  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  return and(...filters);
}

/**
 * Returns true when the table will receive a tenant-isolation WHERE condition
 * from the scoped client — either via a communityId FK column or the
 * communities root-entity special-case (scoped on id).
 * Tables that return false (e.g. users, stripe_webhook_events) are not
 * tenant-scoped and must not be mutated without an explicit additionalWhere.
 */
function hasTenantIsolation(
  table: PgTable<TableConfig>,
): boolean {
  const columns = getTableColumns(table) as ColumnRecord;
  const tableName = getTableName(table as unknown as Table);
  return tableName === COMMUNITIES_TABLE_NAME || hasCommunityIdColumn(columns);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a scoped database client for a specific community.
 *
 * Every query through this client automatically includes:
 * - community_id = communityId (for tables with the column)
 * - deleted_at IS NULL (for soft-deletable tables, except exempt ones)
 *
 * @param communityId - The community to scope all queries to.
 * @param dbInstance - Optional DB instance for dependency injection (testing).
 * @throws TenantContextMissing if communityId is null, undefined, or NaN.
 */
export function createScopedClient(
  communityId: number | null | undefined,
  dbInstance?: DbInstance,
): ScopedClient {
  if (communityId == null || Number.isNaN(communityId)) {
    throw new TenantContextMissing();
  }

  const ctx: TenantContext = { communityId };
  const database = dbInstance ?? defaultDb;

  return {
    get communityId() {
      return ctx.communityId;
    },

    buildWhere(table, additionalWhere) {
      const filters = buildScopeFilters(table, ctx.communityId);
      if (additionalWhere) {
        filters.push(additionalWhere);
      }
      return combineFilters(filters);
    },

    async query(table) {
      const filters = buildScopeFilters(table, ctx.communityId);
      return execSelect(database, table, combineFilters(filters));
    },

    selectFrom<T extends ScopedRow>(
      table: PgTable<TableConfig>,
      columns: Record<string, unknown>,
      additionalWhere?: SQL,
    ): ScopedDynamicBuilder<T> {
      const filters = buildScopeFilters(table, ctx.communityId);
      if (additionalWhere) {
        filters.push(additionalWhere);
      }
      const combined = combineFilters(filters);

      // Build and return the dynamic query builder.
      // Cast through unknown to bypass Drizzle's complex generics.
      // Empty columns object means "select all columns" (like db.select().from())
      const hasColumns = Object.keys(columns).length > 0;
      type DbWithSelect = {
        select(c?: unknown): {
          from(t: unknown): {
            where(w: unknown): { $dynamic(): unknown };
            $dynamic(): unknown;
          };
        };
      };
      const db = database as unknown as DbWithSelect;
      const builder = hasColumns
        ? db.select(columns).from(table)
        : db.select().from(table);

      const withWhere = combined ? builder.where(combined) : builder;
      return withWhere.$dynamic() as ScopedDynamicBuilder<T>;
    },

    async insert(table, data) {
      const columns = getTableColumns(table) as ColumnRecord;
      const requiresCommunityId = hasCommunityIdColumn(columns);

      const preparePayload = (item: Record<string, unknown>) => {
        const newItem = { ...item };
        if (requiresCommunityId) {
          newItem['communityId'] = ctx.communityId;
        }
        return newItem;
      };

      const insertData = Array.isArray(data) ? data.map(preparePayload) : preparePayload(data as Record<string, unknown>);

      // The app server always connects as a privileged role (postgres / service_role).
      // pp_rls_enforce_tenant_community_id returns early via pp_rls_is_privileged() and
      // never reads app.current_community_id, so set_config overhead is unnecessary.
      // Tenant isolation is enforced by communityId injection above and scoped WHERE filters.
      return execInsert(database, table, insertData);
    },

    async update(table, data, additionalWhere?) {
      const updateTableName = getTableName(table as unknown as Table);
      if (APPEND_ONLY_TABLES.has(updateTableName)) {
        throw new Error(
          `Table "${updateTableName}" is append-only. UPDATE operations are not permitted.`,
        );
      }
      if (!hasTenantIsolation(table) && !additionalWhere) {
        throw new UnscopedMutationError('update', updateTableName);
      }

      const filters = buildScopeFilters(table, ctx.communityId);
      if (additionalWhere) {
        filters.push(additionalWhere);
      }

      // Strip communityId from SET to prevent tenant ownership changes
      const updateData = { ...data };
      delete updateData['communityId'];

      // Auto-update updatedAt
      const columns = getTableColumns(table) as ColumnRecord;
      if (hasUpdatedAtColumn(columns)) {
        updateData['updatedAt'] = new Date();
      }

      const whereClause = combineFilters(filters);

      // The app server always connects as a privileged role (postgres / service_role).
      // pp_rls_enforce_tenant_community_id returns early via pp_rls_is_privileged() and
      // never reads app.current_community_id, so set_config overhead is unnecessary.
      // Tenant isolation is enforced by communityId injection above and scoped WHERE filters.
      return execUpdate(database, table, updateData, whereClause);
    },

    async softDelete(table, additionalWhere?) {
      const columns = getTableColumns(table) as ColumnRecord;
      const tableName = getTableName(table as unknown as Table);

      if (APPEND_ONLY_TABLES.has(tableName)) {
        throw new Error(
          `Table "${tableName}" is append-only. DELETE operations are not permitted.`,
        );
      }
      if (!hasTenantIsolation(table) && !additionalWhere) {
        throw new UnscopedMutationError('softDelete', tableName);
      }

      if (!hasDeletedAtColumn(columns)) {
        throw new Error(
          `Table "${tableName}" does not support soft delete (no deleted_at column).`,
        );
      }

      // Build scoping filters (tenant isolation only — don't add deleted_at IS NULL
      // since we're setting it, and we should be able to re-soft-delete)
      const filters: SQL[] = [];
      if (tableName === COMMUNITIES_TABLE_NAME) {
        // Root tenant entity — isolation enforced on id, not community_id
        if (hasIdColumn(columns)) {
          filters.push(eq(columns.id, ctx.communityId));
        }
      } else if (hasCommunityIdColumn(columns)) {
        filters.push(eq(columns.communityId, ctx.communityId));
      }
      if (additionalWhere) {
        filters.push(additionalWhere);
      }

      // Also bump updatedAt if available
      const setData: Record<string, unknown> = { deletedAt: new Date() };
      if (hasUpdatedAtColumn(columns)) {
        setData['updatedAt'] = new Date();
      }

      const whereClause = combineFilters(filters);

      // The app server always connects as a privileged role (postgres / service_role).
      // pp_rls_enforce_tenant_community_id returns early via pp_rls_is_privileged() and
      // never reads app.current_community_id, so set_config overhead is unnecessary.
      // Tenant isolation is enforced by communityId injection above and scoped WHERE filters.
      return execUpdate(database, table, setData, whereClause);
    },

    async hardDelete(table, additionalWhere?) {
      const hardDeleteTableName = getTableName(table as unknown as Table);
      if (APPEND_ONLY_TABLES.has(hardDeleteTableName)) {
        throw new Error(
          `Table "${hardDeleteTableName}" is append-only. DELETE operations are not permitted.`,
        );
      }
      if (!hasTenantIsolation(table) && !additionalWhere) {
        throw new UnscopedMutationError('hardDelete', hardDeleteTableName);
      }

      const filters = buildScopeFilters(table, ctx.communityId);
      if (additionalWhere) {
        filters.push(additionalWhere);
      }

      return execDelete(database, table, combineFilters(filters));
    },
  };
}

/**
 * Exported for testing: allows checking if a table name is soft-delete exempt.
 */
export function isSoftDeleteExempt(tableName: string): boolean {
  return SOFT_DELETE_EXEMPT_TABLES.has(tableName);
}

/**
 * Exported for testing: allows checking if a table name is append-only.
 */
export function isAppendOnlyTable(tableName: string): boolean {
  return APPEND_ONLY_TABLES.has(tableName);
}
