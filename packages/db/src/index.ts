/**
 * Database package — Drizzle ORM + Supabase
 *
 * Public API:
 * - Scoped query builder (AGENTS #14: raw db is NOT exported)
 * - Tenant context types and errors
 * - Supabase client factories (browser, server, admin, middleware, storage)
 * - Schema definitions and inferred types
 */

// Scoped database client — the ONLY way to query tenant-scoped data
export { createScopedClient, isSoftDeleteExempt, isAppendOnlyTable } from './scoped-client';
export type { ScopedClient, ScopedRow, ScopedTable } from './types/scoped-client';

// Tenant context
export type { TenantContext } from './tenant-context';
export { TenantContextMissing } from './errors/TenantContextMissing';

// Supabase clients
export { createBrowserClient } from './supabase/client';
export { createServerClient } from './supabase/server';
export { createAdminClient } from './supabase/admin';
export { createMiddlewareClient } from './supabase/middleware';
export {
  createPresignedUploadUrl,
  createPresignedDownloadUrl,
  deleteStorageObject,
} from './supabase/storage';

// Audit logger
export { logAuditEvent } from './utils/audit-logger';
export type { AuditAction, AuditEventParams } from './utils/audit-logger';

// Schema & types
export * from './schema';

// Query helpers
export { searchDocuments } from './queries/document-search';
export type {
  DocumentSearchItem,
  DocumentSearchParams,
  DocumentSearchResult,
} from './queries/document-search';

export {
  updateDocumentExtractionFailure,
  updateDocumentExtractionSuccess,
} from './queries/document-extraction';
export type {
  DocumentExtractionCompletionStatus,
  DocumentExtractionFailureParams,
  DocumentExtractionSuccessParams,
} from './queries/document-extraction';

// Document access control
export {
  buildDocumentAccessFilter,
  getAccessibleDocuments,
  isDocumentAccessible,
  getDocumentWithAccessCheck,
} from './queries/document-access';
export type { DocumentAccessContext } from './queries/document-access';
