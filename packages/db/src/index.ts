/**
 * Database package — Drizzle ORM + Supabase
 *
 * Public API:
 * - Supabase client factories (browser, server, admin, middleware, storage)
 * - Schema definitions and inferred types
 */

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

// Schema & types
export * from './schema';
