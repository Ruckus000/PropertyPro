/**
 * Portfolio templates — a PM's personal, user-owned library of reusable site
 * branding templates (NOT tenant-scoped; no community_id). Keyed by
 * owner_user_id; RLS restricts every row to its owner via auth.uid().
 *
 * AUTHZ: NOT tenant-scoped. Callers MUST authorize on user identity and only
 * read/write the actor's own rows. Accessed via the unscoped client behind
 * site-portfolio-template-service.ts (allowlisted).
 */
import { bigserial, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const sitePortfolioTemplates = pgTable('site_portfolio_templates', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  branding: jsonb('branding').notNull().default('{}'),
  siteLogoPath: text('site_logo_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
