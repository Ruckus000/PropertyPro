/**
 * Tenant context management for multi-tenant database operations.
 *
 * The TenantContext stores the current community scope. It is used by the
 * scoped client to auto-inject community_id filters on every query,
 * preventing cross-tenant data leaks.
 *
 * AGENTS #14: All database access must go through createScopedClient.
 */
export interface TenantContext {
  /**
   * The community ID for the current request scope.
   *
   * Intentionally `number` in Phase 0 because Drizzle bigint columns are
   * currently configured with `mode: 'number'`.
   */
  communityId: number;
}

// Re-export for convenience
export { TenantContextMissing } from './errors/TenantContextMissing';
