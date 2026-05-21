/**
 * Widgets table — scaffolded by `pnpm new:resource widgets` (Plan A4).
 *
 * Replace this header doc and the columns below with your resource's real
 * shape, then run `pnpm --filter @propertypro/db db:migrate` to apply.
 *
 * Conventions enforced by `.claude/rules/tenant-isolation.md`:
 *   - `community_id` FK on `communities` (root tenant table) with cascade
 *   - `deleted_at` soft-delete column
 *   - `created_at` / `updated_at` with `withTimezone: true`
 *   - RLS + write-scope trigger live in the companion migration SQL
 */
import { bigint, bigserial, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { communities } from './communities';

export const widgets = pgTable('widgets', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type Widget = typeof widgets.$inferSelect;
export type NewWidget = typeof widgets.$inferInsert;
