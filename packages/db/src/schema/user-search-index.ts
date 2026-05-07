/**
 * Denormalized user search index for the command palette's people search.
 *
 * IMPORTANT: This table is **not queried via Drizzle**. The command palette
 * accesses it through raw SQL in `packages/db/src/queries/trigram-search.ts`
 * because pg_trgm operators (`%>`, `gin_trgm_ops`) have no native Drizzle
 * bindings. The Drizzle schema entry exists purely so the table appears in
 * `schema.ts` for visibility and so the canonical baseline can be regenerated
 * without losing it (the table was lost from the snapshot during the
 * 2026-05-06 re-baseline; see project_drizzle_snapshot_collision.md).
 *
 * The two trigram GIN indexes (`idx_user_search_fullname_trgm`,
 * `idx_user_search_email_trgm`) are NOT declared here: they require the
 * `gin_trgm_ops` operator class, which drizzle-orm has no way to express.
 * They are managed manually via raw-SQL migrations and are present in prod.
 *
 * RLS is intentionally NOT enabled: this is a global lookup index keyed by
 * user_id, not a tenant-scoped table. Authorization happens at the query
 * layer in trigram-search.ts (JOINs against user_roles for membership).
 *
 * In production, the `user_id` foreign key references `auth.users(id)`
 * (Supabase auth schema), not `public.users(id)`. Drizzle does not have a
 * clean way to express cross-schema references, so the schema entry omits
 * the FK; the actual constraint is declared in the raw-SQL migration. This
 * only affects schema-as-types inference (this table is not queried via
 * Drizzle anyway), and runtime behavior matches prod exactly.
 */
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

export const userSearchIndex = pgTable('user_search_index', {
  userId: uuid('user_id').primaryKey(),
  fullName: text('full_name'),
  email: text('email').notNull(),
});
